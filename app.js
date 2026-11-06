// TODO: Replace with your actual Firebase project configuration keys
const firebaseConfig = {
	apiKey: 'AIzaSyAAE3km6cEHuqaX2gnNl6z899hKjQDvKsk',
	authDomain: 'seniormessageboard.firebaseapp.com',
	databaseURL: 'https://seniormessageboard-default-rtdb.firebaseio.com',
	projectId: 'seniormessageboard',
	storageBucket: 'seniormessageboard.firebasestorage.app',
	messagingSenderId: '431774663721',
	appId: '1:431774663721:web:8db38395147b6501060838',
};

// Initialize Firebase
if (firebaseConfig.apiKey === 'YOUR_API_KEY') {
	console.error(
		"FIREBASE ERROR: You must replace the placeholders in 'firebaseConfig' with your actual keys from the Firebase Console."
	);
	alert(
		'Configuration Missing: Please update index.html with your Firebase API keys.'
	);
}

			firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

let currentUser = null;
let userProfile = null;
let previousMedsTaken = null;

// Auth State Listener
auth.onAuthStateChanged(async (user) => {
	console.log('Auth State Changed:', user ? 'Logged In' : 'Logged Out');
	if (user) {
		currentUser = user;
		document.getElementById('view-auth').classList.add('hidden');

		try {
			// Fetch user profile from database (or initialize if first login)
			const snap = await database.ref(`users/${user.uid}`).once('value');
			if (!snap.exists()) {
				userProfile = {
					email: user.email || '',
					displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
					role: 'VIEWER',
					active: true,
					notifyOnMeds: false,
					createdAt: Date.now(),
				};
				await database.ref(`users/${user.uid}`).set(userProfile);
			} else {
				userProfile = snap.val() || { role: 'VIEWER', displayName: '', notifyOnMeds: false, active: true };
				if (!userProfile.email && user.email) {
					database.ref(`users/${user.uid}/email`).set(user.email);
					userProfile.email = user.email;
				}
				if (userProfile.active === undefined) {
					userProfile.active = true;
				}
			}
			if (userProfile.role === 'USER') userProfile.role = 'EDITOR'; // legacy role migration
			console.log('User Profile Loaded:', userProfile);

			// Enforce Active Status: Block deactivated accounts
			if (userProfile.active === false) {
				console.warn('Account is deactivated:', user.uid);
				await auth.signOut();
				currentUser = null;
				userProfile = null;
				const authErr = document.getElementById('auth-error');
				if (authErr) {
					authErr.innerText = 'This account has been deactivated. Please contact an administrator.';
					authErr.classList.remove('hidden');
				}
				document.getElementById('view-auth').classList.remove('hidden');
				return;
			}

			// Real-time listener: immediately disconnect if account is deactivated by an admin
			database.ref(`users/${user.uid}/active`).on('value', (activeSnap) => {
				if (activeSnap.exists() && activeSnap.val() === false) {
					alert('Your account has been deactivated by an administrator.');
					auth.signOut();
					location.reload();
				}
			});
		} catch (err) {
			console.warn('Could not fetch user profile, defaulting to VIEWER:', err);
			userProfile = { role: 'VIEWER', displayName: '', notifyOnMeds: false, active: true };
		}

		// Populate Profile Form in Admin/Editor Panel
		const nameInput = document.getElementById('input-profile-name');
		if (nameInput) nameInput.value = userProfile.displayName || user.displayName || '';
		const emailInput = document.getElementById('input-profile-email');
		if (emailInput) emailInput.value = user.email || '';
		const phoneInput = document.getElementById('input-profile-phone');
		if (phoneInput) phoneInput.value = userProfile.phone || '';
		const relationInput = document.getElementById('input-profile-relation');
		if (relationInput) relationInput.value = userProfile.relationship || '';
		const birthdayInput = document.getElementById('input-profile-birthday');
		if (birthdayInput) birthdayInput.value = userProfile.birthday || '';
		const roleBadge = document.getElementById('profile-role-badge');
		if (roleBadge) roleBadge.innerText = 'Role: ' + (userProfile.role || 'VIEWER');
		const panelRolePill = document.getElementById('panel-role-pill');
		if (panelRolePill) panelRolePill.innerText = userProfile.role || 'VIEWER';
		const notifyBox = document.getElementById('input-profile-notify-meds');
		if (notifyBox) notifyBox.checked = !!userProfile.notifyOnMeds;
		const authMsgAuthorInput = document.getElementById('input-message-author');
		if (authMsgAuthorInput && !authMsgAuthorInput.value && !editingMessageId) {
			authMsgAuthorInput.value = getDefaultAuthorName();
		}

		// Sync active Admin/Editor user contact entry to board/userContacts so tablet display can render active users
		if (
			userProfile.active !== false &&
			(userProfile.role === 'ADMIN' || userProfile.role === 'EDITOR')
		) {
			syncCurrentUserContactToBoard();
		}

		updatePermStatus();
		updateUserBadge();

		// Setup view permissions based on role
		const btnAdmin = document.getElementById('btn-admin');
		const sectionAdminOnly = document.getElementById('section-admin-only');
		const adminCardPositions = document.getElementById('admin-card-positions');
		const panelTitle = document.getElementById('admin-panel-title');
		const publishBtn = document.getElementById('btn-publish-data');

		if (userProfile.role === 'ADMIN') {
			if (btnAdmin) {
				btnAdmin.innerText = 'Admin';
				btnAdmin.classList.remove('hidden');
			}
			if (sectionAdminOnly) sectionAdminOnly.classList.remove('hidden');
			if (adminCardPositions) adminCardPositions.classList.remove('hidden');
			if (panelTitle) panelTitle.innerText = 'Remote Administration Panel';
			if (publishBtn) publishBtn.innerText = 'Publish Changes Instantly';
			initUsersManagement();
		} else if (userProfile.role === 'EDITOR') {
			if (btnAdmin) {
				btnAdmin.innerText = 'Editor Panel';
				btnAdmin.classList.remove('hidden');
			}
			if (sectionAdminOnly) sectionAdminOnly.classList.add('hidden');
			if (adminCardPositions) adminCardPositions.classList.add('hidden');
			if (panelTitle) panelTitle.innerText = 'Editor & Maintenance Panel';
			if (publishBtn) publishBtn.innerText = 'Publish Changes Instantly';
		} else {
			// VIEWER role (tablet kiosk display)
			if (btnAdmin) btnAdmin.classList.add('hidden');
			if (adminCardPositions) adminCardPositions.classList.add('hidden');
		}

		initBoard();
	} else {
		currentUser = null;
		userProfile = null;
		previousMedsTaken = null;
		document.getElementById('btn-admin').classList.add('hidden');
		const badge = document.getElementById('user-info-badge');
		if (badge) badge.classList.add('hidden');
		document.getElementById('view-auth').classList.remove('hidden');
	}
});

async function handleLogin() {
	const email = document.getElementById('auth-email').value;
	const pass = document.getElementById('auth-password').value;
	const errEl = document.getElementById('auth-error');
	errEl.classList.add('hidden');

	try {
		await auth.signInWithEmailAndPassword(email, pass);
	} catch (err) {
		errEl.innerText = err.message;
		errEl.classList.remove('hidden');
	}
}

			function handleLogout() {
	auth.signOut();
	location.reload();
}

// Clock & Weather Functionality
let currentZip = '';
let lastWeatherData = null;
let latestBoardData = {};

async function updateWeather(zip) {
	if (!zip) return;
	currentZip = zip;

	try {
		const geoRes = await fetch(
			`https://nominatim.openstreetmap.org/search?postalcode=${zip}&country=US&format=jsonv2&addressdetails=1`
		);
		const geoData = await geoRes.json();

		if (geoData && geoData.length > 0) {
			const geoItem = geoData[0];
			const lat = geoItem.lat;
			const lon = geoItem.lon;
			const address = geoItem.address || {};
			const city =
				address.city ||
				address.town ||
				address.village ||
				address.hamlet ||
				address.municipality ||
				address.suburb ||
				address.county ||
				'';

			const weatherRes = await fetch(
				`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,precipitation_probability,weathercode&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode&timezone=auto&temperature_unit=fahrenheit`
			);
			const weatherData = await weatherRes.json();

			const temp = Math.round(weatherData.current_weather.temperature);
			const high = Math.round(weatherData.daily?.temperature_2m_max?.[0] ?? temp);
			const low = Math.round(weatherData.daily?.temperature_2m_min?.[0] ?? temp);
			const code = weatherData.current_weather.weathercode;
			const rainChanceMax = Math.round(weatherData.daily?.precipitation_probability_max?.[0] ?? 0);

			const hourlyTemps = weatherData.hourly?.temperature_2m || [];
			const hourlyPrecip = weatherData.hourly?.precipitation_probability || [];
			const hourlyCodes = weatherData.hourly?.weathercode || [];

			// Morning curve (8 AM - 11 AM)
			const morningTemps = hourlyTemps.slice(8, 12).map(Math.round).filter((n) => !isNaN(n));
			const morningLow = morningTemps.length ? Math.min(...morningTemps) : low;
			const morningHigh = morningTemps.length ? Math.max(...morningTemps) : temp;
			const morningCode = hourlyCodes[9] !== undefined ? hourlyCodes[9] : code;
			const morningDesc = getWeatherDesc(morningCode);

			// Afternoon peak (12 PM - 4 PM)
			const afternoonTemps = hourlyTemps.slice(12, 17).map(Math.round).filter((n) => !isNaN(n));
			const afternoonPeak = afternoonTemps.length ? Math.max(...afternoonTemps) : high;
			const afternoonCode = hourlyCodes[14] !== undefined ? hourlyCodes[14] : code;
			const afternoonDesc = getWeatherDesc(afternoonCode);

			// Evening wind-down (5 PM - 9 PM)
			const eveningTemps = hourlyTemps.slice(17, 22).map(Math.round).filter((n) => !isNaN(n));
			const eveningAvg = eveningTemps.length ? Math.round(eveningTemps.reduce((a, b) => a + b, 0) / eveningTemps.length) : low;

			// Full-day rain timing & likelihood
			let rainTiming = "Dry and clear all day";
			if (rainChanceMax >= 30) {
				let firstRainHour = -1;
				for (let h = 6; h <= 22; h++) {
					if (hourlyPrecip[h] >= 30) {
						firstRainHour = h;
						break;
					}
				}
				if (firstRainHour !== -1) {
					const rainPeriod = firstRainHour < 12 ? "morning" : firstRainHour < 17 ? "afternoon" : "evening";
					const rainHourStr = (firstRainHour % 12 || 12) + (firstRainHour >= 12 ? " PM" : " AM");
					rainTiming = `Rain expected in the ${rainPeriod} around ${rainHourStr} (${rainChanceMax}% chance)`;
				} else {
					rainTiming = `Chance of showers later today (${rainChanceMax}%)`;
				}
			}

			// Best outdoor / fresh air window
			let bestWindow = "Early afternoon";
			if (rainChanceMax >= 70 && !hourlyPrecip.slice(10, 17).some((p) => p < 40)) {
				bestWindow = "Indoor day recommended (rainy throughout)";
			} else {
				let bestHour = 14;
				let bestScore = -999;
				for (let h = 10; h <= 16; h++) {
					const t = hourlyTemps[h] || 60;
					const p = hourlyPrecip[h] || 0;
					const tempScore = 75 - Math.abs(72 - t);
					const score = tempScore - p * 0.8;
					if (score > bestScore) {
						bestScore = score;
						bestHour = h;
					}
				}
				const startH = (bestHour - 1) % 12 || 12;
				const startAmpm = (bestHour - 1) >= 12 ? "PM" : "AM";
				const endH = (bestHour + 1) % 12 || 12;
				const endAmpm = (bestHour + 1) >= 12 ? "PM" : "AM";
				const bestTemp = Math.round(hourlyTemps[bestHour] || high);
				bestWindow = `${startH}:00 ${startAmpm} \u2013 ${endH}:00 ${endAmpm} (around ${bestTemp}\u00B0F)`;
			}

			const cityEl = document.getElementById('weather-city');
			if (cityEl) {
				cityEl.innerText = city;
				if (city) {
					cityEl.classList.remove('hidden');
				} else {
					cityEl.classList.add('hidden');
				}
			}

			const desc = getWeatherDesc(code);
			const suggestion = getWeatherSuggestion(code);

			const tempEl = document.getElementById('weather-temp');
			if (tempEl) tempEl.innerText = `${temp}\u00B0F`;
			const rangeEl = document.getElementById('weather-range');
			if (rangeEl) rangeEl.innerText = `High: ${high}\u00B0 | Low: ${low}\u00B0`;
			const iconEl = document.getElementById('weather-icon');
			if (iconEl) iconEl.innerText = '';
			const descEl = document.getElementById('weather-desc');
			if (descEl) descEl.innerText = desc;
			const widgetEl = document.getElementById('weather-widget');
			if (widgetEl) widgetEl.classList.remove('hidden');

			lastWeatherData = {
				city,
				temp,
				high,
				low,
				code,
				icon: '',
				desc,
				suggestion,
				rainChanceMax,
				rainTiming,
				morning: `${morningLow}\u00B0F to ${morningHigh}\u00B0F (${morningDesc.toLowerCase()})`,
				afternoon: `peak ${afternoonPeak}\u00B0F (${afternoonDesc.toLowerCase()})`,
				evening: `cooling to around ${eveningAvg}\u00B0F`,
				bestWindow,
			};
			renderAiSummaryCard();
		}
	} catch (err) {
		console.warn('Weather fetch failed:', err);
	}
}

function getWeatherSuggestion(code) {
	if (code === 0 || code === 1) return 'a short walk or some sunshine outside';
	if (code === 2 || code === 3) return 'some light bird watching or fresh air';
	if (code >= 51 && code <= 65) return 'staying cozy indoors and calling a friend';
	if (code >= 71 && code <= 75) return 'staying warm inside with a hot cup of tea';
	if (code === 95) return 'staying safe indoors with a puzzle or board game';
	return 'relaxing indoor activities';
}

function getWeatherDesc(code) {
	const descriptions = {
		0: 'Clear sky',
		1: 'Mainly clear',
		2: 'Partly cloudy',
		3: 'Overcast',
		45: 'Foggy',
		48: 'Depositing rime fog',
		51: 'Light drizzle',
		53: 'Moderate drizzle',
		55: 'Dense drizzle',
		61: 'Slight rain',
		63: 'Moderate rain',
		65: 'Heavy rain',
		71: 'Slight snow',
		73: 'Moderate snow',
		75: 'Heavy snow',
		95: 'Thunderstorm',
	};
	return descriptions[code] || 'Cloudy';
}

function updateClock() {
	const now = new Date();
	document.getElementById('display-time').innerText = now.toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
	});
	document.getElementById('display-date').innerText = now.toLocaleDateString([], {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
	});
}
setInterval(updateClock, 1000);
updateClock();
setInterval(() => { if (currentZip) updateWeather(currentZip); }, 60 * 60 * 1000);

// View Switcher Tabs
function switchView(view) {
	const views = ['display', 'admin'];
	views.forEach((v) => {
		const el = document.getElementById(`view-${v}`);
		const btn = document.getElementById(`btn-${v}`);
		if (el) {
			if (v === view) {
				el.classList.remove('hidden');
			} else {
				el.classList.add('hidden');
			}
		}
		if (btn) {
			if (v === view) {
				btn.className =
					'px-3.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs sm:text-sm font-semibold shadow-sm transition';
			} else {
				btn.className =
					'px-3.5 py-1.5 text-slate-600 hover:text-slate-900 rounded-lg text-xs sm:text-sm font-semibold transition';
			}
		}
	});
}

function switchAdminTab(tab) {
	const tabs = ['daily', 'checkin', 'settings', 'people'];
	tabs.forEach((t) => {
		const panel = document.getElementById(`admin-tab-${t}`);
		const btn = document.getElementById(`btn-admin-tab-${t}`);
		if (panel) {
			if (t === tab) {
				panel.classList.remove('hidden');
			} else {
				panel.classList.add('hidden');
			}
		}
		if (btn) {
			if (t === tab) {
				btn.className =
					'py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition flex items-center justify-center bg-white text-blue-700 shadow-sm border border-slate-200/80 text-center';
			} else {
				btn.className =
					'py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition flex items-center justify-center text-slate-600 hover:text-slate-900 text-center';
			}
		}
	});
	if (tab === 'checkin') {
		renderMemoryJournalEntries();
		renderStoryCatcherSparks();
	}
}

// ================= KIOSK MULTI-PAGE NAVIGATION =================
let currentKioskPage = 'today';
let kioskIdleTimer = null;
const KIOSK_IDLE_TIMEOUT_MS = 90 * 1000; // 90 seconds auto-return to Today for Alzheimer's accessibility

function switchKioskPage(pageName) {
	const validPages = ['today', 'meds', 'events', 'family'];
	if (!validPages.includes(pageName)) pageName = 'today';
	currentKioskPage = pageName;

	validPages.forEach((p) => {
		const pageEl = document.getElementById(`disp-page-${p}`);
		const btnEl = document.getElementById(`btn-kiosk-page-${p}`);
		if (pageEl) {
			if (p === pageName) {
				pageEl.classList.remove('hidden');
			} else {
				pageEl.classList.add('hidden');
			}
		}
		if (btnEl) {
			if (p === pageName) {
				btnEl.className =
					'py-3.5 sm:py-4 px-3 sm:px-4 rounded-xl font-black text-xl sm:text-2xl flex items-center justify-center gap-2 transition cursor-pointer bg-blue-600 text-white shadow-md';
			} else {
				btnEl.className =
					'py-3.5 sm:py-4 px-3 sm:px-4 rounded-xl font-black text-xl sm:text-2xl flex items-center justify-center gap-2 transition cursor-pointer bg-white text-slate-700 hover:bg-slate-100 border-2 border-slate-200';
			}
		}
	});

	window.scrollTo({ top: 0, behavior: 'smooth' });
	resetKioskIdleTimer();
}

function resetKioskIdleTimer() {
	if (kioskIdleTimer) {
		clearTimeout(kioskIdleTimer);
		kioskIdleTimer = null;
	}
	if (currentKioskPage !== 'today') {
		kioskIdleTimer = setTimeout(() => {
			console.log('Kiosk idle timeout reached, returning to Today page');
			switchKioskPage('today');
		}, KIOSK_IDLE_TIMEOUT_MS);
	}
}

// User activity listeners to reset idle timer on touch or click
if (typeof window !== 'undefined') {
	['touchstart', 'mousedown', 'keydown', 'scroll'].forEach((evt) => {
		window.addEventListener(
			evt,
			() => {
				if (currentKioskPage !== 'today') {
					resetKioskIdleTimer();
				}
			},
			{ passive: true }
		);
	});
}

function updateKioskNavBadges(boardData) {
	const data = boardData || latestBoardData || {};
	const todayStr = getTodayDateString();

	// 1. Medicine Nav Badge & Page Status
	const medsBadge = document.getElementById('kiosk-nav-meds-badge');
	const pageMedsStatusText = document.getElementById('page-meds-status-text');
	const pageMedsBtn = document.getElementById('btn-take-meds-page');

	if (data.medsTaken) {
		if (medsBadge) {
			medsBadge.innerText = 'Taken';
			medsBadge.className =
				'text-xs sm:text-sm font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300';
			medsBadge.classList.remove('hidden');
		}
		if (pageMedsStatusText) {
			if (data.medsTakenTime) {
				const time = new Date(data.medsTakenTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
				pageMedsStatusText.innerText = `Morning medicine logged today at ${time}.`;
			} else {
				pageMedsStatusText.innerText = 'Morning medicine logged for today.';
			}
		}
		if (pageMedsBtn) {
			pageMedsBtn.className =
				'w-full sm:w-auto px-8 py-4 bg-emerald-50 text-emerald-800 border-2 border-emerald-300 font-black rounded-2xl shadow-none text-xl sm:text-2xl transition cursor-default';
			pageMedsBtn.innerHTML = '<span>MEDS LOGGED</span>';
		}
	} else {
		if (medsBadge) {
			medsBadge.innerText = 'Pending';
			medsBadge.className =
				'text-xs sm:text-sm font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-200';
			medsBadge.classList.remove('hidden');
		}
		if (pageMedsStatusText) {
			pageMedsStatusText.innerText = 'Please take your morning medicine with breakfast and water.';
		}
		if (pageMedsBtn) {
			pageMedsBtn.className =
				'w-full sm:w-auto px-8 py-4 bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white font-black rounded-2xl shadow-sm text-xl sm:text-2xl transition cursor-pointer';
			pageMedsBtn.innerHTML = '<span>I TOOK MY MEDS</span>';
		}
	}

	// 2. Events Nav Badge
	const eventsBadge = document.getElementById('kiosk-nav-events-badge');
	if (eventsBadge) {
		const upcomingCount = Object.values(currentEventsMap || {}).filter((e) =>
			isEventUpcomingOrActive(e, todayStr)
		).length;
		if (upcomingCount > 0) {
			eventsBadge.innerText = `${upcomingCount}`;
			eventsBadge.classList.remove('hidden');
		} else {
			eventsBadge.classList.add('hidden');
		}
	}

	// 3. Family Messages Nav Badge
	const familyBadge = document.getElementById('kiosk-nav-family-badge');
	if (familyBadge) {
		const activeMsgs = getStructuredMessagesList(data).filter((m) => !isMessageExpired(m, todayStr));
		if (activeMsgs.length > 0) {
			familyBadge.innerText = `${activeMsgs.length} ${activeMsgs.length === 1 ? 'Note' : 'Notes'}`;
			familyBadge.classList.remove('hidden');
		} else {
			familyBadge.classList.add('hidden');
		}
	}
}

function initBoard() {
	console.log('Initializing Board...');
	setupEventFormAutoDetect();
	// Connection Monitor
	const statusEl = document.getElementById('connection-status');
	database.ref('.info/connected').on('value', (snap) => {
		console.log('Connection Status Changed:', snap.val());
		if (snap.val() === true) {
			statusEl.innerText = '● Live Sync Active';
			statusEl.className =
				'text-[10px] uppercase tracking-wider text-emerald-600 font-semibold mt-0.5';
		} else {
			statusEl.innerText = '○ Disconnected';
			statusEl.className =
				'text-[10px] uppercase tracking-wider text-rose-600 font-semibold mt-0.5';
		}
	});

	// Fetch Upcoming Major US Holidays
	fetchUpcomingUSHolidays();

	// Real-Time Listeners
	database.ref('board').on(
		'value',
		(snapshot) => {
			const data = snapshot.val();
			console.log('Board Data Received:', data);
			renderBoard(data || {}); // Pass empty object if no data exists
		},
		(error) => {
			console.error('Database Read Error:', error);
			alert('Permission Denied: You do not have access to read the board data.');
		}
	);
}

let currentCardPositions = {
	messages: 1,
	medications: 2,
	events: 3,
	contacts: 4,
};
let currentBoardUserContacts = {};
let currentAdditionalContacts = {};
let liveUsersData = {};

function normalizeCardPositions(posData) {
	const raw = posData || {};
	const keys = ['messages', 'medications', 'events', 'contacts'];
	const entries = keys.map((k, idx) => {
		const val = parseInt(raw[k], 10);
		return { key: k, order: isNaN(val) ? idx + 100 : val, tie: idx };
	});
	entries.sort((a, b) => (a.order !== b.order ? a.order - b.order : a.tie - b.tie));

	const result = {};
	entries.forEach((item, index) => {
		result[item.key] = index + 1;
	});
	return result;
}

function applyCardPositions(posData) {
	currentCardPositions = normalizeCardPositions(posData);

	const grid = document.getElementById('display-cards-grid');
	const cardMap = {
		messages: document.getElementById('card-messages'),
		medications: document.getElementById('card-medications'),
		events: document.getElementById('card-events'),
		contacts: document.getElementById('card-contacts'),
	};

	if (
		grid &&
		cardMap.messages &&
		cardMap.medications &&
		cardMap.events &&
		cardMap.contacts
	) {
		const sortedKeys = Object.keys(currentCardPositions).sort(
			(a, b) => currentCardPositions[a] - currentCardPositions[b]
		);
		sortedKeys.forEach((key) => {
			const cardEl = cardMap[key];
			if (cardEl) {
				cardEl.style.order = String(currentCardPositions[key]);
				grid.appendChild(cardEl);
			}
		});
	}

	const selMsg = document.getElementById('select-pos-messages');
	const selMed = document.getElementById('select-pos-medications');
	const selEvt = document.getElementById('select-pos-events');
	const selCon = document.getElementById('select-pos-contacts');
	if (selMsg) selMsg.value = String(currentCardPositions.messages);
	if (selMed) selMed.value = String(currentCardPositions.medications);
	if (selEvt) selEvt.value = String(currentCardPositions.events);
	if (selCon) selCon.value = String(currentCardPositions.contacts);
}

async function handleCardPositionChange(changedCard, newPosValue) {
	if (!userProfile || userProfile.role !== 'ADMIN') {
		alert('Permission Denied: Only ADMIN users can change card positions.');
		applyCardPositions(currentCardPositions);
		return;
	}

	const targetPos = parseInt(newPosValue, 10);
	if (![1, 2, 3, 4].includes(targetPos)) return;

	const oldPos = currentCardPositions[changedCard];
	if (oldPos === targetPos) return;

	const updatedPositions = { ...currentCardPositions };
	Object.keys(updatedPositions).forEach((key) => {
		if (key !== changedCard && updatedPositions[key] === targetPos) {
			updatedPositions[key] = oldPos;
		}
	});
	updatedPositions[changedCard] = targetPos;

	applyCardPositions(updatedPositions);

	try {
		await database.ref('board/cardPositions').set(updatedPositions);
		showToast('Display card order updated!');
	} catch (err) {
		console.error('Failed to update card positions:', err);
		alert('Error saving card positions: ' + err.message);
	}
}

function updateEntryCountBadge(badgeEl, count) {
	if (!badgeEl) return;
	if (count > 0) {
		badgeEl.innerText = `${count} ${count === 1 ? 'Entry' : 'Entries'}`;
		badgeEl.classList.remove('hidden');
	} else {
		badgeEl.classList.add('hidden');
	}
}

function renderTextLinesCard(containerId, badgeId, rawText, emptyTitle, emptySubtitle, emoji) {
	const container = document.getElementById(containerId);
	const badgeEl = document.getElementById(badgeId);
	const lines = String(rawText || '')
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);

	updateEntryCountBadge(badgeEl, lines.length);

	if (!container) return;
	if (lines.length === 0) {
		container.innerHTML = `
			<div class="w-full p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center space-y-1">
				<div class="text-2xl">${emoji}</div>
				<div class="text-base font-bold text-slate-700">${escapeHtml(emptyTitle)}</div>
				<div class="text-xs text-slate-500">${escapeHtml(emptySubtitle)}</div>
			</div>
		`;
		return;
	}

	container.innerHTML = lines
		.map((line) => {
			const cleaned = line.replace(/^[-•*]\s*/, '');
			return `
				<div class="p-3 sm:p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-lg sm:text-xl text-slate-800 font-medium leading-snug">
					${escapeHtml(cleaned)}
				</div>
			`;
		})
		.join('');
}

const DEFAULT_AI_RULES =
	'Infusion: Drink 2-3 extra glasses of water each day starting 3 days before a scheduled infusion.\n' +
	'Blood Draw: Drink plenty of water the day before and morning of your lab visit.\n' +
	'Physical Therapy: Set out comfortable sneakers and loose clothing.';

function saveGeminiApiKeyLocal(key) {
	try {
		const trimmed = (key || '').trim();
		if (trimmed) {
			localStorage.setItem('smb_gemini_api_key', trimmed);
		} else {
			localStorage.removeItem('smb_gemini_api_key');
		}
	} catch (e) {
		console.warn('Could not save Gemini API key to localStorage:', e);
	}
}

function loadGeminiApiKeyLocal() {
	try {
		return localStorage.getItem('smb_gemini_api_key') || '';
	} catch (e) {
		return '';
	}
}

// ================= SENIOR DAILY CHECK-IN (INTERACTIVE, NO EMOJIS) =================

// ================= CONVERSATIONAL SENIOR CHECK-IN & MEMORY JOURNAL =================
// A gentle, multi-turn conversational bank tailored for seniors with early-stage Alzheimer's.
// Features:
// 1. Zero performance pressure: Every prompt offers comforting agency ("Not sure today", "None of these").
// 2. Interactive pivot: "Ask me another question" immediately swaps questions right on screen.
// 3. Multi-turn follow-up: Tapping an answer triggers a warm, validating reaction + a gentle 2nd-turn question.
// 4. Senior Memory Journal: Every response and reflection is saved chronologically in Firebase.

const CONVERSATIONAL_CHECKIN_TOPICS = [
	{
		id: 'music_mood',
		question: 'What kind of music always puts you in the best mood?',
		choices: [
			'Big band and swing',
			'Classic country and folk',
			'Gentle piano or classical',
			'Not sure today',
		],
		followups: {
			'Big band and swing': {
				reaction: 'Big band and swing has such wonderful energy!',
				question: 'Did you like dancing with friends, or listening on the radio?',
				choices: ['Dancing with friends', 'Listening on the radio', 'Both were wonderful', "I'm all done for now"],
			},
			'Classic country and folk': {
				reaction: 'Classic country melodies tell such heartwarming stories.',
				question: 'Do you enjoy lively acoustic fiddles, or gentle sweet ballads?',
				choices: ['Lively acoustic fiddles', 'Sweet gentle ballads', 'Singing along to both', "I'm all done for now"],
			},
			'Gentle piano or classical': {
				reaction: 'Gentle piano music brings such peace and calm to the home.',
				question: 'Does soft piano feel best in a quiet morning, or relaxing in the afternoon?',
				choices: ['Quiet morning with coffee', 'Peaceful afternoon rest', 'Anytime of day', "I'm all done for now"],
			},
		},
	},
	{
		id: 'favorite_sweet',
		question: 'What was your all-time favorite homemade sweet treat growing up?',
		choices: [
			'Warm fruit pie or cobbler',
			'Fresh baked cookies',
			'Rich cake or brownies',
			'None of these',
		],
		followups: {
			'Warm fruit pie or cobbler': {
				reaction: 'Warm pie straight out of the oven is the best treat in the world!',
				question: 'Did you like apple pie, peach cobbler, or berry pie best?',
				choices: ['Cinnamon apple pie', 'Sweet peach cobbler', 'Warm berry pie', "I'm all done for now"],
			},
			'Fresh baked cookies': {
				reaction: 'Nothing beats the smell of warm cookies baking in the oven.',
				question: 'Were you a fan of chocolate chip, oatmeal, or sugar cookies?',
				choices: ['Warm chocolate chip', 'Oatmeal with cinnamon', 'Sweet sugar cookies', "I'm all done for now"],
			},
			'Rich cake or brownies': {
				reaction: 'Chocolate cake and warm brownies always hit the spot.',
				question: 'Did you enjoy having a tall cold glass of milk with it?',
				choices: ['Cold glass of milk', 'Warm cup of coffee', 'A scoop of ice cream', "I'm all done for now"],
			},
		},
	},
	{
		id: 'kitchen_aroma',
		question: 'What aroma from the kitchen brings back the warmest memories?',
		choices: [
			'Fresh bread in the oven',
			'Warm cinnamon and spice',
			'A simmering pot of soup',
			'Not sure today',
		],
		followups: {
			'Fresh bread in the oven': {
				reaction: 'There is nothing quite like homemade bread baking in the oven.',
				question: 'Did you like putting melting butter or sweet jam on warm bread?',
				choices: ['Melting fresh butter', 'Sweet homemade jam', 'Both together', "I'm all done for now"],
			},
			'Warm cinnamon and spice': {
				reaction: 'Cinnamon and spices make any home feel cozy and welcoming.',
				question: 'Does that aroma remind you of holiday baking with family?',
				choices: ['Family holiday baking', 'Autumn kitchen days', 'Hot spiced cider', "I'm all done for now"],
			},
			'A simmering pot of soup': {
				reaction: 'A warm pot of simmering soup warms the heart on a quiet day.',
				question: 'Did your family have a favorite homemade soup recipe?',
				choices: ['Chicken noodle soup', 'Hearty vegetable stew', 'Potato or corn chowder', "I'm all done for now"],
			},
		},
	},
	{
		id: 'cozy_spot',
		question: 'What is your favorite spot to sit and unwind during the day?',
		choices: [
			'By a sunny window',
			'In a comfy living room chair',
			'Out on the porch or patio',
			'None of these',
		],
		followups: {
			'By a sunny window': {
				reaction: 'Sitting in warm natural sunshine is so soothing.',
				question: 'Do you like watching the birds outside, or resting with eyes closed?',
				choices: ['Watching birds outside', 'Resting with eyes closed', 'Just feeling the warm sun', "I'm all done for now"],
			},
			'In a comfy living room chair': {
				reaction: 'A comfortable armchair is the perfect place to relax.',
				question: 'Do you like having a soft warm blanket over your lap?',
				choices: ['A cozy warm blanket', 'Soft music playing', 'A warm drink in hand', "I'm all done for now"],
			},
			'Out on the porch or patio': {
				reaction: 'Fresh air and gentle outdoor sounds are wonderful for the spirit.',
				question: 'Do you enjoy the gentle breeze, or waving to passing neighbors?',
				choices: ['The gentle fresh breeze', 'Waving to neighbors', 'Listening to nature', "I'm all done for now"],
			},
		},
	},
	{
		id: 'childhood_pastime',
		question: 'Which pastime was your favorite as a youngster?',
		choices: [
			'Playing outdoors with friends',
			'Board games with family',
			'Riding bicycles around town',
			'Not sure today',
		],
		followups: {
			'Playing outdoors with friends': {
				reaction: 'Playing outside until the streetlights came on was magical.',
				question: 'Did you play tag, hide and seek, or yard games with friends?',
				choices: ['Hide and seek', 'Yard games and tag', 'Roller skating or hopscotch', "I'm all done for now"],
			},
			'Board games with family': {
				reaction: 'Gathering around the table for games brings back so much laughter.',
				question: 'Did your family play card games or classic board games?',
				choices: ['Card games with family', 'Classic board games', 'Puzzles together', "I'm all done for now"],
			},
			'Riding bicycles around town': {
				reaction: 'The feeling of freedom on a bicycle is unforgettable.',
				question: 'Did you ride around neighborhood sidewalks or down to the park?',
				choices: ['Neighborhood sidewalks', 'Down to the local park', 'Riding with school friends', "I'm all done for now"],
			},
		},
	},
	{
		id: 'comfort_drink',
		question: 'What comforting warm drink feels best in your hands on a quiet day?',
		choices: [
			'Rich hot cocoa',
			'Sweet herbal or black tea',
			'Fresh brewed coffee',
			'None of these',
		],
		followups: {
			'Rich hot cocoa': {
				reaction: 'Hot cocoa is a timeless comfort on a quiet morning.',
				question: 'Do you like marshmallows on top, or whipped cream?',
				choices: ['Fluffy marshmallows', 'Sweet whipped cream', 'Just smooth and hot', "I'm all done for now"],
			},
			'Sweet herbal or black tea': {
				reaction: 'A warm mug of tea is soothing from the very first sip.',
				question: 'Do you like putting a spoonful of honey or a splash of milk in it?',
				choices: ['Sweet golden honey', 'A splash of milk', 'Just plain and warm', "I'm all done for now"],
			},
			'Fresh brewed coffee': {
				reaction: 'The morning aroma of coffee is always uplifting.',
				question: 'Do you like your coffee with sweet cream, or black and simple?',
				choices: ['Sweet cream and sugar', 'A splash of milk', 'Black and simple', "I'm all done for now"],
			},
		},
	},
	{
		id: 'smile_spark',
		question: 'What is something small that always brings a smile to your heart?',
		choices: [
			'A sweet note or call from family',
			'Watching birds at the feeder',
			'Looking at old family photos',
			'Not sure today',
		],
		followups: {
			'A sweet note or call from family': {
				reaction: 'Hearing from loved ones is the greatest gift of all.',
				question: 'Do you love keeping family cards and letters nearby to see?',
				choices: ['Keeping cards on display', 'Hearing voices on the phone', 'Warm hugs in person', "I'm all done for now"],
			},
			'Watching birds at the feeder': {
				reaction: 'Birds bring so much color and cheerfulness to the yard.',
				question: 'Is your favorite bird the bright red cardinal, or little chickadees?',
				choices: ['Bright red cardinals', 'Playful chickadees', 'Goldfinches and blue jays', "I'm all done for now"],
			},
			'Looking at old family photos': {
				reaction: 'Family photo albums hold so many precious stories.',
				question: 'Do you like seeing pictures of children growing up, or old wedding days?',
				choices: ['Children growing up', 'Old childhood pictures', 'Wedding and holiday photos', "I'm all done for now"],
			},
		},
	},
	{
		id: 'hometown_memory',
		question: 'What do you remember most fondly about your hometown growing up?',
		choices: [
			'Friendly neighborhood streets',
			'The local soda fountain or diner',
			'Summer fairs and parades',
			'None of these',
		],
		followups: {
			'Friendly neighborhood streets': {
				reaction: 'Those quiet neighborhood streets felt so safe and welcoming.',
				question: 'Did everyone sit out on front porches in the evening?',
				choices: ['Porch chats with neighbors', 'Walking under tall trees', 'Playing until dusk', "I'm all done for now"],
			},
			'The local soda fountain or diner': {
				reaction: 'Stopping by the soda counter for an ice cream float was a true treat.',
				question: 'Did you like root beer floats, or ice cream milkshakes best?',
				choices: ['Classic root beer float', 'Chocolate malt or shake', 'An ice cream sundae', "I'm all done for now"],
			},
			'Summer fairs and parades': {
				reaction: 'The sights and sounds of a hometown parade are unforgettable.',
				question: 'Did you love the marching bands, or the carnival treats and games?',
				choices: ['Marching bands & music', 'Cotton candy and treats', 'Fun games and prizes', "I'm all done for now"],
			},
		},
	},
	{
		id: 'scenic_trip',
		question: 'If you were taking a scenic train ride today, what view would you choose?',
		choices: [
			'Majestic green mountains',
			'Peaceful ocean coastline',
			'Quiet country farmland',
			'Not sure today',
		],
		followups: {
			'Majestic green mountains': {
				reaction: 'Mountain views with tall trees and peaks are breathtaking.',
				question: 'Would you like watching from a comfortable window seat in the observation car?',
				choices: ['Window seat with coffee', 'Observation car view', 'Resting and glancing out', "I'm all done for now"],
			},
			'Peaceful ocean coastline': {
				reaction: 'Watching rolling waves and blue water brings instant calm.',
				question: 'Do you love the look of sandy beaches or rocky lighthouses?',
				choices: ['Warm sandy beaches', 'Historic lighthouses', 'Watching ocean sunsets', "I'm all done for now"],
			},
			'Quiet country farmland': {
				reaction: 'Rolling green pastures and red barns are so peaceful.',
				question: 'Does the countryside remind you of childhood Sunday road trips?',
				choices: ['Family Sunday drives', 'Visiting relatives on farms', 'Wide open blue skies', "I'm all done for now"],
			},
		},
	},
	{
		id: 'favorite_season',
		question: 'Which season of the year brings you the most happiness?',
		choices: [
			'Warm sunny summertime',
			'Crisp colorful autumn',
			'Fresh blooming springtime',
			'None of these',
		],
		followups: {
			'Warm sunny summertime': {
				reaction: 'Summer brings long sunny days and blooming flowers.',
				question: 'Did you love outdoor family picnics or evening porch sitting?',
				choices: ['Outdoor family picnics', 'Warm evening porch sitting', 'Cooling off with ice cream', "I'm all done for now"],
			},
			'Crisp colorful autumn': {
				reaction: 'Autumn with colorful leaves and cool air is so refreshing.',
				question: 'Do you enjoy hot spiced cider or watching the leaves change color?',
				choices: ['Watching colorful leaves', 'Warm cups of spiced cider', 'Wearing a cozy sweater', "I'm all done for now"],
			},
			'Fresh blooming springtime': {
				reaction: 'Springtime brings the world back to life with green shoots.',
				question: 'Do you love hearing songbirds return, or seeing flowers bloom?',
				choices: ['Songbirds singing in morning', 'Tulips and daffodils blooming', 'Opening windows for air', "I'm all done for now"],
			},
		},
	},
];

// Compatibility aliases
const CREATIVE_FALLBACK_CHECKIN_QUESTIONS = CONVERSATIONAL_CHECKIN_TOPICS;
const DEFAULT_ROTATING_CHECKIN_QUESTIONS = CONVERSATIONAL_CHECKIN_TOPICS;

let checkinConversationState = {
	turn: 1,
	topicIndex: 0,
	turn1Choice: null,
	isEditing: false,
};

function getDayOfYear(date = new Date()) {
	const start = new Date(date.getFullYear(), 0, 0);
	const diff = date - start + (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000;
	return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// Initialize topic index based on calendar day
try {
	checkinConversationState.topicIndex = getDayOfYear() % CONVERSATIONAL_CHECKIN_TOPICS.length;
} catch (e) {}

function isRepetitiveLegacyQuestion(questionText) {
	if (!questionText || typeof questionText !== 'string') return false;
	const q = questionText.toLowerCase();
	return (
		q.includes('dinner') ||
		q.includes('agenda') ||
		q.includes('what are you doing') ||
		q.includes('what are your plans') ||
		q.includes('what is on your') ||
		q.includes('how is your energy')
	);
}

function getActiveCheckinTopic(boardData) {
	const data = boardData || latestBoardData || {};
	// 1. Explicit Admin custom question override
	if (data.customCheckinQuestion && data.customCheckinQuestion.trim()) {
		const qText = data.customCheckinQuestion.trim();
		let choices = ['Yes', 'No', 'Not sure today'];
		if (data.customCheckinChoices && data.customCheckinChoices.trim()) {
			const parsed = data.customCheckinChoices
				.split(',')
				.map((c) => c.trim())
				.filter(Boolean);
			if (parsed.length > 0) choices = parsed;
		}
		if (!choices.some((c) => c.toLowerCase().includes('not sure') || c.toLowerCase().includes('none'))) {
			choices.push('Not sure today');
		}
		return {
			id: 'custom_admin',
			question: qText,
			choices: choices,
			source: 'Custom',
		};
	}

	// 2. Select from the conversational topic bank
	const idx = Math.abs(checkinConversationState.topicIndex) % CONVERSATIONAL_CHECKIN_TOPICS.length;
	return CONVERSATIONAL_CHECKIN_TOPICS[idx] || CONVERSATIONAL_CHECKIN_TOPICS[0];
}

function getActiveCheckinQuestion(boardData) {
	const topic = getActiveCheckinTopic(boardData);
	return {
		question: topic.question,
		choices: topic.choices,
		source: topic.source || 'Conversation Bank',
	};
}

function cycleNextCheckinQuestion() {
	checkinConversationState.topicIndex =
		(checkinConversationState.topicIndex + 1) % CONVERSATIONAL_CHECKIN_TOPICS.length;
	checkinConversationState.turn = 1;
	checkinConversationState.turn1Choice = null;
	renderSeniorCheckin(latestBoardData);
	showToast('Switched to another question!');
}

async function selectCheckinTurn1Choice(choice) {
	const todayStr = getTodayDateString();
	const activeTopic = getActiveCheckinTopic(latestBoardData);

	const isEscape =
		choice.toLowerCase().includes('not sure') ||
		choice.toLowerCase().includes('none');

	if (isEscape) {
		const entry = {
			dateStr: todayStr,
			timestamp: Date.now(),
			question: activeTopic.question,
			answer: choice,
			notes: 'Mom checked in (Not sure / None of these)',
		};
		await recordSeniorJournalEntry(entry);

		const responsePayload = {
			question: activeTopic.question,
			answer: choice,
			timestamp: Date.now(),
			dateStr: todayStr,
		};
		try {
			localStorage.setItem('smb_local_senior_response', JSON.stringify(responsePayload));
		} catch (e) {}

		if (!latestBoardData) latestBoardData = {};
		latestBoardData.seniorResponse = responsePayload;
		checkinConversationState.turn = 1;
		checkinConversationState.turn1Choice = null;
		checkinConversationState.isEditing = false;
		renderSeniorCheckin(latestBoardData);

		try {
			database.ref('board/seniorResponse').set(responsePayload).catch(() => {});
		} catch (err) {}
		renderAiSummaryCard();
		return;
	}

	// Check if follow-up exists for this choice
	const followup = activeTopic.followups && activeTopic.followups[choice];
	if (followup) {
		checkinConversationState.turn = 2;
		checkinConversationState.turn1Choice = choice;
		renderSeniorCheckin(latestBoardData);
	} else {
		// Single turn completion
		const entry = {
			dateStr: todayStr,
			timestamp: Date.now(),
			question: activeTopic.question,
			answer: choice,
		};
		await recordSeniorJournalEntry(entry);

		const responsePayload = {
			question: activeTopic.question,
			answer: choice,
			timestamp: Date.now(),
			dateStr: todayStr,
		};
		try {
			localStorage.setItem('smb_local_senior_response', JSON.stringify(responsePayload));
		} catch (e) {}

		if (!latestBoardData) latestBoardData = {};
		latestBoardData.seniorResponse = responsePayload;
		checkinConversationState.turn = 1;
		checkinConversationState.turn1Choice = null;
		checkinConversationState.isEditing = false;
		renderSeniorCheckin(latestBoardData);

		try {
			database.ref('board/seniorResponse').set(responsePayload).catch(() => {});
		} catch (err) {}
		renderAiSummaryCard();
	}
}

async function selectCheckinTurn2Choice(followupChoice) {
	const todayStr = getTodayDateString();
	const activeTopic = getActiveCheckinTopic(latestBoardData);
	const turn1Choice = checkinConversationState.turn1Choice;
	const followupObj = activeTopic.followups && activeTopic.followups[turn1Choice];

	const isDone = followupChoice === "I'm all done for now";
	const entry = {
		dateStr: todayStr,
		timestamp: Date.now(),
		question: activeTopic.question,
		answer: turn1Choice,
		followupQuestion: !isDone && followupObj ? followupObj.question : undefined,
		followupAnswer: !isDone ? followupChoice : undefined,
		notes: isDone ? 'Wrapped up at Turn 1' : undefined,
	};
	await recordSeniorJournalEntry(entry);

	const responsePayload = {
		question: activeTopic.question,
		answer: turn1Choice,
		followupQuestion: !isDone && followupObj ? followupObj.question : undefined,
		followupAnswer: !isDone ? followupChoice : undefined,
		timestamp: Date.now(),
		dateStr: todayStr,
	};

	try {
		localStorage.setItem('smb_local_senior_response', JSON.stringify(responsePayload));
	} catch (e) {}

	if (!latestBoardData) latestBoardData = {};
	latestBoardData.seniorResponse = responsePayload;
	checkinConversationState.turn = 1;
	checkinConversationState.turn1Choice = null;
	checkinConversationState.isEditing = false;

	renderSeniorCheckin(latestBoardData);

	try {
		database.ref('board/seniorResponse').set(responsePayload).catch(() => {});
	} catch (err) {}

	renderAiSummaryCard();
}

// Alias for compatibility
function submitSeniorCheckin(choice) {
	return selectCheckinTurn1Choice(choice);
}

function resetSeniorCheckinChoice() {
	checkinConversationState.turn = 1;
	checkinConversationState.turn1Choice = null;
	checkinConversationState.isEditing = true;

	renderSeniorCheckin(latestBoardData);
}

function renderSeniorCheckin(boardData) {
	const data = boardData || latestBoardData || {};
	const sectionEl = document.getElementById('disp-senior-checkin-section');
	const turn1El = document.getElementById('disp-checkin-turn1');
	const turn2El = document.getElementById('disp-checkin-turn2');
	const confirmEl = document.getElementById('disp-checkin-confirmation');
	const qEl = document.getElementById('disp-checkin-question');
	const optionsEl = document.getElementById('disp-checkin-options');
	const reactionEl = document.getElementById('disp-checkin-reaction');
	const followupQEl = document.getElementById('disp-checkin-followup-question');
	const followupOptionsEl = document.getElementById('disp-checkin-followup-options');
	const answerTextEl = document.getElementById('disp-checkin-answer-text');
	const followupAnswerTextEl = document.getElementById('disp-checkin-followup-answer-text');
	const timeTextEl = document.getElementById('disp-checkin-time-text');
	const badgeEl = document.getElementById('disp-checkin-status-badge');

	if (!sectionEl || !confirmEl) return;

	const todayStr = getTodayDateString();
	let resp = data.seniorResponse;

	if (!resp) {
		try {
			const localRaw = localStorage.getItem('smb_local_senior_response');
			if (localRaw) {
				const parsed = JSON.parse(localRaw);
				if (parsed && parsed.dateStr === todayStr) {
					resp = parsed;
				}
			}
		} catch (e) {}
	}

	const hasAnsweredToday =
		resp && resp.dateStr === todayStr && resp.answer && !checkinConversationState.isEditing;

	if (hasAnsweredToday) {
		if (turn1El) turn1El.classList.add('hidden');
		if (turn2El) turn2El.classList.add('hidden');
		document.getElementById('disp-checkin-voice')?.classList.add('hidden');
		confirmEl.classList.remove('hidden');
		if (badgeEl) badgeEl.classList.remove('hidden');

		const confirmTitleEl = document.getElementById('disp-checkin-confirm-title');
		if (resp.isStory) {
			if (confirmTitleEl) confirmTitleEl.innerText = "Mom's Memory Recorded";
			if (answerTextEl) answerTextEl.innerText = `"${resp.answer}"`;
			if (followupAnswerTextEl) {
				if (resp.storyText) {
					const preview = resp.storyText.length > 140 ? resp.storyText.slice(0, 137) + '...' : resp.storyText;
					followupAnswerTextEl.innerText = `"${preview}"`;
					followupAnswerTextEl.classList.remove('hidden');
				} else {
					followupAnswerTextEl.classList.add('hidden');
				}
			}
		} else {
			if (confirmTitleEl) confirmTitleEl.innerText = 'Response Recorded';
			if (answerTextEl) {
				if (resp.answer.toLowerCase().includes('not sure') || resp.answer.toLowerCase().includes('none')) {
					answerTextEl.innerText = `${resp.answer} — and that is completely fine!`;
				} else {
					answerTextEl.innerText = resp.answer;
				}
			}
			if (followupAnswerTextEl) {
				if (resp.followupAnswer && resp.followupAnswer !== "I'm all done for now") {
					followupAnswerTextEl.innerText = `Mom: "${resp.followupAnswer}"`;
					followupAnswerTextEl.classList.remove('hidden');
				} else {
					followupAnswerTextEl.classList.add('hidden');
				}
			}
		}
		if (timeTextEl) {
			const timeStr = resp.timestamp
				? new Date(resp.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
				: '';
			timeTextEl.innerText = timeStr ? `Logged today at ${timeStr}` : 'Logged for today';
		}
	} else {
		confirmEl.classList.add('hidden');
		if (badgeEl) badgeEl.classList.add('hidden');
		if (!kioskVoiceActive) {
			document.getElementById('disp-checkin-voice')?.classList.add('hidden');
		}

		const activeTopic = getActiveCheckinTopic(data);

		if (checkinConversationState.turn === 2 && checkinConversationState.turn1Choice) {
			// Turn 2 Followup
			if (turn1El) turn1El.classList.add('hidden');
			if (turn2El) turn2El.classList.remove('hidden');

			const choice = checkinConversationState.turn1Choice;
			const followup = activeTopic.followups && activeTopic.followups[choice];

			if (followup && reactionEl && followupQEl && followupOptionsEl) {
				reactionEl.innerText = followup.reaction || 'Thank you for sharing that!';
				followupQEl.innerText = followup.question;
				followupOptionsEl.innerHTML = followup.choices
					.map(
						(c) => `
						<button
							type="button"
							onclick="selectCheckinTurn2Choice('${escapeHtml(c).replace(/'/g, "\\'")}')"
							class="w-full text-left px-5 py-4 ${
								c.includes('all done')
									? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-2 border-slate-300'
									: 'bg-white hover:bg-blue-50 active:bg-blue-600 active:text-white text-slate-950 border-2 border-blue-300 hover:border-blue-500'
							} rounded-2xl font-bold text-xl sm:text-2xl transition shadow-xs cursor-pointer leading-snug"
						>
							${escapeHtml(c)}
						</button>
					`
					)
					.join('');
			}
		} else {
			// Turn 1 Opening
			if (turn2El) turn2El.classList.add('hidden');
			if (turn1El) turn1El.classList.remove('hidden');

			if (qEl) qEl.innerText = activeTopic.question;
			if (optionsEl) {
				optionsEl.innerHTML = activeTopic.choices
					.map(
						(choice) => `
						<button
							type="button"
							onclick="selectCheckinTurn1Choice('${escapeHtml(choice).replace(/'/g, "\\'")}')"
							class="w-full text-left px-5 py-4 ${
								choice.toLowerCase().includes('not sure') || choice.toLowerCase().includes('none')
									? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-2 border-slate-300'
									: 'bg-white hover:bg-blue-50 active:bg-blue-600 active:text-white text-slate-950 border-2 border-blue-300 hover:border-blue-500'
							} rounded-2xl font-bold text-xl sm:text-2xl transition shadow-xs cursor-pointer leading-snug"
						>
							${escapeHtml(choice)}
						</button>
					`
					)
					.join('');
			}
		}
	}

	renderAdminCheckinResponse(resp, todayStr);
}

// ================= SENIOR MEMORY JOURNAL & VOICE STORYTELLING =================

const REMINISCENCE_INTERVIEW_SPARKS = [
	{
		topic: 'Sunday Dinner Traditions',
		category: 'Family & Cooking',
		question: "What was your family's favorite Sunday dinner or special recipe growing up?",
	},
	{
		topic: 'First Car & Road Trips',
		category: 'Adventures & Travel',
		question: 'Tell us about the first car you ever drove or had in your family.',
	},
	{
		topic: 'Dances & Big Bands',
		category: 'Music & Joy',
		question: 'What was your favorite song or big band to dance to when you were young?',
	},
	{
		topic: 'Childhood Neighborhood & Friends',
		category: 'Hometown Memories',
		question: 'What games did you and the neighborhood kids play until the streetlights came on?',
	},
	{
		topic: 'Favorite Childhood Pet',
		category: 'Pets & Companions',
		question: 'Tell us about a special pet you had growing up and what made them so wonderful.',
	},
	{
		topic: 'How Mom and Dad Met',
		category: 'Love & Romance',
		question: 'Tell us the story of how you and Dad first met.',
	},
	{
		topic: 'Holiday Baking & Treats',
		category: 'Traditions & Holidays',
		question: 'What holiday baking or treats did you love making the most with family?',
	},
	{
		topic: 'First Job & Independence',
		category: 'Youth & Work',
		question: 'What was your very first job, and what did you buy with your first paycheck?',
	},
	{
		topic: 'Summer Vacations & Lakes',
		category: 'Summer Days',
		question: 'Where was your favorite place to go on warm summer days or family vacations?',
	},
	{
		topic: 'School Days & Best Friends',
		category: 'School Memories',
		question: 'Who was your best friend in school, and what fun things did you two do together?',
	},
	{
		topic: 'Favorite Outfits & Dances',
		category: 'Fashion & Memories',
		question: 'Tell us about a favorite dress or outfit you felt so special wearing.',
	},
	{
		topic: 'Advice from Parents',
		category: 'Wisdom & Family',
		question: 'What was the best advice your mother or father ever shared with you?',
	},
];

async function recordSeniorJournalEntry(entry) {
	const todayStr = getTodayDateString();
	const id = `journal_${Date.now()}`;
	const payload = {
		id: id,
		dateStr: entry.dateStr || todayStr,
		timestamp: entry.timestamp || Date.now(),
		question: entry.question || '',
		answer: entry.answer || '',
		followupQuestion: entry.followupQuestion || '',
		followupAnswer: entry.followupAnswer || '',
		notes: entry.notes || '',
		rawTranscript: entry.rawTranscript || '',
		storyTitle: entry.storyTitle || '',
		source: entry.source || 'checkin_tap',
	};

	if (!latestBoardData) latestBoardData = {};
	if (!latestBoardData.seniorJournal) latestBoardData.seniorJournal = {};
	latestBoardData.seniorJournal[id] = payload;

	try {
		localStorage.setItem('smb_local_senior_journal', JSON.stringify(latestBoardData.seniorJournal));
	} catch (e) {}

	try {
		database.ref(`board/seniorJournal/${id}`).set(payload).catch((err) => {
			console.warn('Firebase sync of journal entry failed:', err);
		});
	} catch (err) {}

	updateAdminJournalCount();
}

function updateAdminJournalCount() {
	const countBadge = document.getElementById('admin-journal-count-badge');
	const totalText = document.getElementById('journal-total-count-text');
	const entries = Object.values(latestBoardData?.seniorJournal || {});
	const count = entries.length;
	const label = count === 1 ? '1 entry' : `${count} entries`;
	if (countBadge) countBadge.innerText = label;
	if (totalText) totalText.innerText = count === 1 ? '1 Memory Recorded' : `${count} Memories Recorded`;
}

// ---------------- AI Story Polisher & Gemini REST Client ----------------

// Universal Browser-Compatible Gemini API Caller with CORS Support, Timeouts, and Dynamic Model Discovery
let cachedGeminiModel = null;

async function getAvailableGeminiModel(cleanKey) {
	if (cachedGeminiModel) return cachedGeminiModel;

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second limit for discovery

	try {
		const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`, {
			method: 'GET',
			signal: controller.signal,
			headers: {
				'x-goog-api-key': cleanKey,
			},
		});

		if (res.ok) {
			const data = await res.json();
			const rawModels = data?.models || [];
			console.log('Google ListModels returned:', rawModels);

			const supported = rawModels
				.filter((m) => {
					const methods = m.supportedGenerationMethods || m.supported_generation_methods || [];
					return Array.isArray(methods) ? methods.some((method) => method.toLowerCase().includes('generatecontent')) : true;
				})
				.map((m) => (m.name || '').replace(/^models\//, ''))
				.filter(Boolean);

			console.log('Supported generateContent models for this key:', supported);

			// Preferred models in priority order
			const preferredList = [
				'gemini-3.8-flash',
				'gemini-3.5-flash-lite',
				'gemini-3.1-flash-lite',
				'gemini-4-argon',
				'gemini-2.5-flash',
				'gemini-2.0-flash',
				'gemini-1.5-flash',
			];

			for (const p of preferredList) {
				if (supported.includes(p)) {
					cachedGeminiModel = p;
					return p;
				}
			}

			// If no exact match from preferredList, check if any model includes 'flash'
			const flashModel = supported.find((m) => m.toLowerCase().includes('flash'));
			if (flashModel) {
				cachedGeminiModel = flashModel;
				return flashModel;
			}

			if (supported.length > 0) {
				cachedGeminiModel = supported[0];
				return supported[0];
			}
		} else {
			const errData = await res.json().catch(() => null);
			if (errData?.error?.message) {
				throw new Error(errData.error.message);
			}
		}
	} catch (e) {
		console.warn('Model discovery check:', e.message);
		if (e.message && (e.message.includes('API key') || e.message.includes('disabled') || e.message.includes('PERMISSION') || e.message.includes('has not been used'))) {
			throw e;
		}
	} finally {
		clearTimeout(timeoutId);
	}
	return 'gemini-3.8-flash';
}

async function callGeminiApi(apiKey, requestPayload, preferredModel = 'gemini-3.8-flash') {
	const cleanKey = (apiKey || '').trim().replace(/^["']|["']$/g, '');
	if (!cleanKey) throw new Error('No API key provided');

	// Attempt to discover active model from this key
	let activeModel = preferredModel;
	try {
		activeModel = await getAvailableGeminiModel(cleanKey);
	} catch (discoveryErr) {
		throw discoveryErr;
	}

	const modelsToTry = [activeModel, 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
	const uniqueModels = [...new Set(modelsToTry)];

	let lastError = null;
	for (const model of uniqueModels) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 20000); // 20-second timeout per model attempt

		try {
			const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cleanKey)}`;
			const response = await fetch(url, {
				method: 'POST',
				signal: controller.signal,
				headers: {
					'Content-Type': 'application/json',
					'x-goog-api-key': cleanKey,
				},
				body: JSON.stringify(requestPayload),
			});

			if (response.ok) {
				const data = await response.json();
				const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
				if (text) {
					cachedGeminiModel = model;
					return text;
				}
				throw new Error('Gemini API returned an empty response.');
			}

			const errorData = await response.json().catch(() => null);
			const errMsg = errorData?.error?.message || `HTTP ${response.status} on ${model}`;

			// If it's a 404 model not found, save error and try next model in fallback list
			if (response.status === 404) {
				console.warn(`Model ${model} returned 404 (${errMsg}), trying fallback...`);
				lastError = new Error(errMsg);
				continue;
			}

			// For any other error (e.g. invalid key, quota, permission), throw immediately
			throw new Error(errMsg);
		} catch (err) {
			lastError = err;
			if (err.name === 'AbortError') {
				lastError = new Error(`Connection to model ${model} timed out after 20 seconds.`);
				console.warn(lastError.message);
				continue;
			}
			if (err.message && err.message.includes('404')) {
				continue;
			}
			throw err;
		} finally {
			clearTimeout(timeoutId);
		}
	}
	throw lastError || new Error('All model requests failed. Please check your Gemini API key in Google AI Studio.');
}

async function polishMemoryStoryWithAI({ transcript, promptTopic, source = 'voice' }) {
	const raw = (transcript || '').trim();
	if (!raw) return { title: 'Spoken Memory', story: '', summary: '' };

	// 1. Try Gemini API if key is present on device
	const apiKey = loadGeminiApiKeyLocal() || (latestBoardData?.geminiApiKey || '');
	if (apiKey) {
		try {
			const systemInstructionText =
				"You are a loving family biographer helping an 80+ senior who has early-stage Alzheimer's capture her precious life memories.\n" +
				'Given a spoken memory prompt and raw transcript (which may contain vocal fillers like "um", "let me see", repetitions, or conversational tangents):\n' +
				'1. Clean up conversational stutter/hesitations while strictly keeping her authentic colloquial phrasing, personality, dialect, and voice intact. Do NOT over-formalize or make it sound academic.\n' +
				'2. Format the memory into 1 to 3 warm, evocative paragraphs written in the first person ("I remember...").\n' +
				'3. Create a warm, evocative 2 to 5 word Title for the memory book (e.g. "Dancing at the Pavilion", "Our 1957 Blue Chevy").\n' +
				'4. Output MUST be valid JSON with keys: "title" (string), "story" (string), and "summary" (string).';

			const requestPayload = {
				systemInstruction: {
					parts: [{ text: systemInstructionText }],
				},
				contents: [
					{
						parts: [
							{
								text: `Topic / Prompt: ${promptTopic || "Mom's Memory"}\nRaw Spoken Transcript:\n${raw}`,
							},
						],
					},
				],
				generationConfig: {
					responseMimeType: 'application/json',
				},
			};

			const textOutput = await callGeminiApi(apiKey, requestPayload, 'gemini-3.8-flash');
			const cleanJson = textOutput.replace(/```json\n?|\n?```/g, '').trim();
			const parsed = JSON.parse(cleanJson);
			if (parsed && (parsed.story || parsed.title)) {
				return {
					title: (parsed.title || 'Family Memory').trim(),
					story: (parsed.story || raw).trim(),
					summary: (parsed.summary || '').trim(),
				};
			}
		} catch (err) {
			console.warn('Gemini story polishing failed, falling back to smart rule-based polisher:', err);
		}
	}

	// 2. Built-in Smart Rule-Based Story Polisher (Zero API key required)
	return smartRuleBasedStoryPolish(raw, promptTopic);
}

function smartRuleBasedStoryPolish(rawTranscript, promptTopic) {
	if (!rawTranscript) return { title: 'Spoken Memory', story: '', summary: '' };

	// Clean common vocal fillers and stutters
	let cleaned = rawTranscript
		.replace(/\b(um+|uh+|er+|ah+|you know|like I said|sort of|kind of|let's see|let me see)\b/gi, '')
		.replace(/\b(\w+)\s+\1\b/gi, '$1') // remove stutter duplicates (e.g. "we we" -> "we")
		.replace(/\s+/g, ' ')
		.trim();

	// Capitalize sentences
	cleaned = cleaned.replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());
	if (cleaned && !/[.!?]$/.test(cleaned)) cleaned += '.';

	// Determine Title
	let title = '';
	if (promptTopic && promptTopic.length > 3 && !promptTopic.toLowerCase().includes('loading')) {
		title = promptTopic
			.replace(/^(what was your|what were your|what is your|tell us about|tell me about|who was your|did you|where was your|which)\s+/i, '')
			.replace(/[?.]+$/, '');
		title = title.charAt(0).toUpperCase() + title.slice(1);
		if (title.length > 35) title = title.slice(0, 32) + '...';
	} else {
		const firstWords = cleaned.split(' ').slice(0, 4).join(' ');
		title = firstWords ? `${firstWords}...` : "Mom's Memory";
	}

	return {
		title: title || "Mom's Memory",
		story: cleaned,
		summary: cleaned.slice(0, 100),
	};
}

// ---------------- Option 1: Kiosk "Tap & Talk" Voice Journaling ----------------

let kioskRecognition = null;
let kioskVoiceActive = false;
let kioskVoiceTimer = null;
let kioskSilenceTimer = null;
let kioskVoiceSeconds = 0;
let kioskTranscript = '';
let kioskCurrentPrompt = '';

function getSpeechRecognitionClass() {
	return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function startKioskVoiceCapture(isFollowup = false) {
	const activeTopic = getActiveCheckinTopic(latestBoardData);
	if (isFollowup && checkinConversationState.turn1Choice) {
		const choice = checkinConversationState.turn1Choice;
		const followup = activeTopic.followups && activeTopic.followups[choice];
		kioskCurrentPrompt = followup ? followup.question : activeTopic.question;
	} else {
		kioskCurrentPrompt = activeTopic.question || "Mom's Spoken Memory";
	}

	const promptEl = document.getElementById('disp-voice-prompt');
	const transcriptEl = document.getElementById('disp-voice-transcript');
	const timerEl = document.getElementById('disp-voice-timer');
	const statusTextEl = document.getElementById('disp-voice-status-text');
	const fallbackEl = document.getElementById('disp-voice-fallback-msg');

	if (promptEl) promptEl.innerText = kioskCurrentPrompt;
	if (transcriptEl) transcriptEl.innerText = '';
	if (timerEl) timerEl.innerText = '00:00';
	if (statusTextEl) {
		statusTextEl.innerText = 'Speak naturally. Take all the time you need, Mom...';
		statusTextEl.classList.remove('hidden');
	}
	if (fallbackEl) fallbackEl.classList.add('hidden');

	// Hide checkin containers and show voice container
	document.getElementById('disp-checkin-turn1')?.classList.add('hidden');
	document.getElementById('disp-checkin-turn2')?.classList.add('hidden');
	document.getElementById('disp-checkin-confirmation')?.classList.add('hidden');
	document.getElementById('disp-checkin-voice')?.classList.remove('hidden');

	kioskTranscript = '';
	kioskVoiceSeconds = 0;
	kioskVoiceActive = true;

	// Reset idle timer while Mom is talking
	resetKioskIdleTimer();

	// Check browser SpeechRecognition support
	const SpeechClass = getSpeechRecognitionClass();
	if (!SpeechClass) {
		if (fallbackEl) {
			fallbackEl.innerText = 'Speech recognition is not supported in this browser. Tap Cancel to use the buttons.';
			fallbackEl.classList.remove('hidden');
		}
		return;
	}

	try {
		kioskRecognition = new SpeechClass();
		kioskRecognition.continuous = true;
		kioskRecognition.interimResults = true;
		kioskRecognition.lang = 'en-US';

		kioskRecognition.onresult = (event) => {
			resetKioskIdleTimer();
			let finalPart = '';
			let interimPart = '';
			for (let i = 0; i < event.results.length; ++i) {
				if (event.results[i].isFinal) {
					finalPart += event.results[i][0].transcript + ' ';
				} else {
					interimPart += event.results[i][0].transcript;
				}
			}
			kioskTranscript = (finalPart + interimPart).trim();
			if (transcriptEl) {
				transcriptEl.innerText = kioskTranscript;
			}
			if (kioskTranscript && statusTextEl) {
				statusTextEl.classList.add('hidden');
			}

			// 8-second silence detector: auto-save once Mom speaks 4+ words and stops speaking
			if (kioskSilenceTimer) clearTimeout(kioskSilenceTimer);
			if (kioskTranscript.split(' ').length >= 4) {
				kioskSilenceTimer = setTimeout(() => {
					if (kioskVoiceActive) {
						stopKioskVoiceCapture(true);
					}
				}, 8000);
			}
		};

		kioskRecognition.onerror = (event) => {
			console.warn('Kiosk speech recognition error:', event.error);
			if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
				if (fallbackEl) {
					fallbackEl.innerText = 'Microphone permission was not allowed. Tap Cancel to use the buttons.';
					fallbackEl.classList.remove('hidden');
				}
			}
		};

		kioskRecognition.onend = () => {
			if (kioskVoiceActive) {
				try {
					kioskRecognition.start();
				} catch (e) {}
			}
		};

		kioskRecognition.start();
	} catch (e) {
		console.warn('Could not start speech recognition:', e);
		if (fallbackEl) {
			fallbackEl.innerText = 'Could not access microphone. Tap Cancel to use the buttons.';
			fallbackEl.classList.remove('hidden');
		}
	}

	// Elapsed timer
	if (kioskVoiceTimer) clearInterval(kioskVoiceTimer);
	kioskVoiceTimer = setInterval(() => {
		kioskVoiceSeconds++;
		const mins = String(Math.floor(kioskVoiceSeconds / 60)).padStart(2, '0');
		const secs = String(kioskVoiceSeconds % 60).padStart(2, '0');
		if (timerEl) timerEl.innerText = `${mins}:${secs}`;
	}, 1000);
}

async function stopKioskVoiceCapture(shouldSave = true) {
	kioskVoiceActive = false;
	if (kioskSilenceTimer) clearTimeout(kioskSilenceTimer);
	if (kioskVoiceTimer) clearInterval(kioskVoiceTimer);

	if (kioskRecognition) {
		try {
			kioskRecognition.stop();
		} catch (e) {}
		kioskRecognition = null;
	}

	const rawWords = (kioskTranscript || '').trim();

	if (shouldSave && rawWords) {
		const statusTextEl = document.getElementById('disp-voice-status-text');
		if (statusTextEl) {
			statusTextEl.innerText = 'Saving your memory to your Memory Book...';
			statusTextEl.classList.remove('hidden');
		}

		// Polish story
		const polished = await polishMemoryStoryWithAI({
			transcript: rawWords,
			promptTopic: kioskCurrentPrompt,
			source: 'kiosk_voice',
		});

		const todayStr = getTodayDateString();
		const entry = {
			dateStr: todayStr,
			timestamp: Date.now(),
			question: kioskCurrentPrompt,
			answer: polished.story || rawWords,
			rawTranscript: rawWords,
			storyTitle: polished.title || "Mom's Memory",
			notes: 'Spoken on Kiosk',
			source: 'kiosk_voice',
		};

		await recordSeniorJournalEntry(entry);

		const responsePayload = {
			question: kioskCurrentPrompt,
			answer: polished.title || 'Mom shared a spoken memory',
			storyText: polished.story || rawWords,
			isStory: true,
			timestamp: Date.now(),
			dateStr: todayStr,
		};

		try {
			localStorage.setItem('smb_local_senior_response', JSON.stringify(responsePayload));
		} catch (e) {}

		if (!latestBoardData) latestBoardData = {};
		latestBoardData.seniorResponse = responsePayload;
		checkinConversationState.turn = 1;
		checkinConversationState.turn1Choice = null;
		checkinConversationState.isEditing = false;

		try {
			database.ref('board/seniorResponse').set(responsePayload).catch(() => {});
		} catch (err) {}

		document.getElementById('disp-checkin-voice')?.classList.add('hidden');
		renderSeniorCheckin(latestBoardData);
		renderAiSummaryCard();
		showToast("Story saved to Mom's Memory Book!");
	} else {
		cancelKioskVoiceCapture();
	}
}

function cancelKioskVoiceCapture() {
	kioskVoiceActive = false;
	if (kioskSilenceTimer) clearTimeout(kioskSilenceTimer);
	if (kioskVoiceTimer) clearInterval(kioskVoiceTimer);

	if (kioskRecognition) {
		try {
			kioskRecognition.stop();
		} catch (e) {}
		kioskRecognition = null;
	}

	document.getElementById('disp-checkin-voice')?.classList.add('hidden');
	renderSeniorCheckin(latestBoardData);
}

// ---------------- Option 2: Caregiver "Story Catcher" Mode in Admin ----------------

let caregiverRecognition = null;
let caregiverVoiceActive = false;
let caregiverVoiceTimer = null;
let caregiverVoiceSeconds = 0;
let storyCatcherSparksIndex = 0;

function openStoryCatcherModal() {
	switchView('admin');
	switchAdminTab('checkin');
	const container = document.getElementById('journal-story-catcher-container');
	if (container) {
		container.classList.remove('hidden');
		container.scrollIntoView({ behavior: 'smooth' });
	}
	document.getElementById('journal-add-entry-container')?.classList.add('hidden');
	renderStoryCatcherSparks();
	const dateInput = document.getElementById('input-story-catcher-date');
	if (dateInput && !dateInput.value) {
		dateInput.value = getTodayDateString();
	}
}

function toggleStoryCatcherForm() {
	const container = document.getElementById('journal-story-catcher-container');
	if (!container) return;
	const isHidden = container.classList.contains('hidden');
	if (isHidden) {
		container.classList.remove('hidden');
		document.getElementById('journal-add-entry-container')?.classList.add('hidden');
		renderStoryCatcherSparks();
		const dateInput = document.getElementById('input-story-catcher-date');
		if (dateInput && !dateInput.value) {
			dateInput.value = getTodayDateString();
		}
	} else {
		container.classList.add('hidden');
		if (caregiverVoiceActive) {
			stopCaregiverVoiceRecording();
		}
	}
}

function renderStoryCatcherSparks() {
	const listEl = document.getElementById('story-catcher-sparks-list');
	if (!listEl) return;

	const sparks = [];
	const total = REMINISCENCE_INTERVIEW_SPARKS.length;
	for (let i = 0; i < 3; i++) {
		const idx = (storyCatcherSparksIndex + i) % total;
		sparks.push({ ...REMINISCENCE_INTERVIEW_SPARKS[idx], globalIndex: idx });
	}

	listEl.innerHTML = sparks
		.map(
			(s) => `
		<button
			type="button"
			onclick="selectStoryCatcherSparkByIndex(${s.globalIndex})"
			class="text-left p-2.5 bg-white hover:bg-indigo-50 active:bg-indigo-100 rounded-xl border border-indigo-200 shadow-2xs transition group cursor-pointer"
		>
			<span class="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">${escapeHtml(s.category)}</span>
			<span class="text-xs font-semibold text-slate-900 group-hover:text-indigo-950 block mt-0.5 leading-snug">"${escapeHtml(s.question)}"</span>
		</button>
	`
		)
		.join('');
}

function selectStoryCatcherSparkByIndex(index) {
	const spark = REMINISCENCE_INTERVIEW_SPARKS[index];
	if (spark) {
		selectStoryCatcherSpark(spark.question);
	}
}

function refreshStoryCatcherSparks() {
	storyCatcherSparksIndex = (storyCatcherSparksIndex + 3) % REMINISCENCE_INTERVIEW_SPARKS.length;
	renderStoryCatcherSparks();
}

function selectStoryCatcherSpark(promptText) {
	const input = document.getElementById('input-story-catcher-topic');
	if (input) {
		input.value = promptText;
		input.focus();
	}
}

function toggleCaregiverVoiceRecording() {
	if (caregiverVoiceActive) {
		stopCaregiverVoiceRecording();
	} else {
		startCaregiverVoiceRecording();
	}
}

function startCaregiverVoiceRecording() {
	const SpeechClass = getSpeechRecognitionClass();
	if (!SpeechClass) {
		alert('Speech recognition is not supported in this browser. You can type or paste notes directly into the transcript box.');
		return;
	}

	const btnText = document.getElementById('btn-story-catcher-record-text');
	const btn = document.getElementById('btn-story-catcher-record');
	const statusEl = document.getElementById('story-catcher-rec-status');
	const indicatorEl = document.getElementById('story-catcher-rec-indicator');
	const timerEl = document.getElementById('story-catcher-rec-timer');
	const transcriptArea = document.getElementById('input-story-catcher-transcript');

	caregiverVoiceActive = true;
	caregiverVoiceSeconds = 0;

	if (btnText) btnText.innerText = 'Stop Interview & Review';
	if (btn) {
		btn.classList.remove('bg-rose-600', 'hover:bg-rose-700');
		btn.classList.add('bg-slate-800', 'hover:bg-slate-900');
	}
	if (statusEl) statusEl.innerText = 'Listening to conversation...';
	if (indicatorEl) indicatorEl.classList.remove('hidden');

	try {
		caregiverRecognition = new SpeechClass();
		caregiverRecognition.continuous = true;
		caregiverRecognition.interimResults = true;
		caregiverRecognition.lang = 'en-US';

		let previousTranscript = transcriptArea ? transcriptArea.value : '';

		caregiverRecognition.onresult = (event) => {
			let finalPart = '';
			let interimPart = '';
			for (let i = 0; i < event.results.length; ++i) {
				if (event.results[i].isFinal) {
					finalPart += event.results[i][0].transcript + ' ';
				} else {
					interimPart += event.results[i][0].transcript;
				}
			}
			const currentSession = (finalPart + interimPart).trim();
			if (transcriptArea) {
				transcriptArea.value = (previousTranscript ? previousTranscript + ' ' : '') + currentSession;
			}
		};

		caregiverRecognition.onerror = (e) => {
			console.warn('Caregiver recognition error:', e.error);
			if (e.error === 'not-allowed') {
				alert('Microphone permission was denied.');
				stopCaregiverVoiceRecording();
			}
		};

		caregiverRecognition.onend = () => {
			if (caregiverVoiceActive) {
				try {
					caregiverRecognition.start();
				} catch (e) {}
			}
		};

		caregiverRecognition.start();
	} catch (err) {
		console.warn('Could not start caregiver recognition:', err);
		stopCaregiverVoiceRecording();
	}

	if (caregiverVoiceTimer) clearInterval(caregiverVoiceTimer);
	caregiverVoiceTimer = setInterval(() => {
		caregiverVoiceSeconds++;
		const mins = String(Math.floor(caregiverVoiceSeconds / 60)).padStart(2, '0');
		const secs = String(caregiverVoiceSeconds % 60).padStart(2, '0');
		if (timerEl) timerEl.innerText = `${mins}:${secs}`;
	}, 1000);
}

function stopCaregiverVoiceRecording() {
	caregiverVoiceActive = false;
	if (caregiverVoiceTimer) clearInterval(caregiverVoiceTimer);

	if (caregiverRecognition) {
		try {
			caregiverRecognition.stop();
		} catch (e) {}
		caregiverRecognition = null;
	}

	const btnText = document.getElementById('btn-story-catcher-record-text');
	const btn = document.getElementById('btn-story-catcher-record');
	const statusEl = document.getElementById('story-catcher-rec-status');
	const indicatorEl = document.getElementById('story-catcher-rec-indicator');

	if (btnText) btnText.innerText = 'Start Voice Interview';
	if (btn) {
		btn.classList.add('bg-rose-600', 'hover:bg-rose-700');
		btn.classList.remove('bg-slate-800', 'hover:bg-slate-900');
	}
	if (statusEl) statusEl.innerText = 'Interview paused / finished';
	if (indicatorEl) indicatorEl.classList.add('hidden');
}

function clearStoryCatcherTranscript() {
	if (confirm('Clear the current interview transcript?')) {
		const transcriptArea = document.getElementById('input-story-catcher-transcript');
		const titleEl = document.getElementById('input-story-catcher-title');
		const storyEl = document.getElementById('input-story-catcher-story');
		if (transcriptArea) transcriptArea.value = '';
		if (titleEl) titleEl.value = '';
		if (storyEl) storyEl.value = '';
	}
}

async function polishCaregiverStoryWithAI() {
	const transcriptArea = document.getElementById('input-story-catcher-transcript');
	const topicInput = document.getElementById('input-story-catcher-topic');
	const titleInput = document.getElementById('input-story-catcher-title');
	const storyArea = document.getElementById('input-story-catcher-story');
	const polishBtn = document.getElementById('btn-format-story-ai');

	const raw = (transcriptArea?.value || '').trim();
	if (!raw) {
		alert('Please record or type a conversation transcript first before formatting.');
		return;
	}

	const topic = (topicInput?.value || '').trim() || 'Conversation with Mom';

	if (polishBtn) {
		polishBtn.disabled = true;
		polishBtn.innerHTML = 'Formatting with AI...';
	}

	try {
		const polished = await polishMemoryStoryWithAI({
			transcript: raw,
			promptTopic: topic,
			source: 'caregiver_interview',
		});

		if (titleInput && (!titleInput.value || titleInput.value.trim().length === 0)) {
			titleInput.value = polished.title || "Mom's Story";
		}
		if (storyArea) {
			storyArea.value = polished.story || raw;
		}
		showToast('Story formatted! Review and save when ready.');
	} catch (e) {
		console.warn('Formatting error:', e);
		if (storyArea && !storyArea.value) {
			storyArea.value = raw;
		}
	} finally {
		if (polishBtn) {
			polishBtn.disabled = false;
			polishBtn.innerHTML = 'Format Story with AI';
		}
	}
}

async function saveCaregiverStoryInterview() {
	const topicInput = document.getElementById('input-story-catcher-topic');
	const dateInput = document.getElementById('input-story-catcher-date');
	const transcriptArea = document.getElementById('input-story-catcher-transcript');
	const titleInput = document.getElementById('input-story-catcher-title');
	const storyArea = document.getElementById('input-story-catcher-story');

	const storyText = (storyArea?.value || transcriptArea?.value || '').trim();
	if (!storyText) {
		alert('Please record or type a story before saving.');
		return;
	}

	const dateStr = (dateInput?.value || '').trim() || getTodayDateString();
	const prompt = (topicInput?.value || '').trim() || 'Conversation with Mom';
	const rawTranscript = (transcriptArea?.value || '').trim();
	const title = (titleInput?.value || '').trim() || 'Family Memory';

	await recordSeniorJournalEntry({
		dateStr,
		question: prompt,
		answer: storyText,
		rawTranscript: rawTranscript,
		storyTitle: title,
		notes: 'Voice Interview with Family',
		source: 'caregiver_interview',
		timestamp: Date.now(),
	});

	if (transcriptArea) transcriptArea.value = '';
	if (titleInput) titleInput.value = '';
	if (storyArea) storyArea.value = '';
	if (topicInput) topicInput.value = '';

	toggleStoryCatcherForm();
	renderMemoryJournalEntries();
	showToast("Story saved to Mom's Memory Book!");
}

function openMemoryJournalModal() {
	switchView('admin');
	switchAdminTab('checkin');
	renderMemoryJournalEntries();
	const journalEl = document.getElementById('admin-memory-journal-section');
	if (journalEl) journalEl.scrollIntoView({ behavior: 'smooth' });
}

function closeMemoryJournalModal() {
	if (caregiverVoiceActive) {
		stopCaregiverVoiceRecording();
	}
}

function toggleAddJournalEntryForm() {
	const formContainer = document.getElementById('journal-add-entry-container');
	if (!formContainer) return;
	const isHidden = formContainer.classList.contains('hidden');
	if (isHidden) {
		formContainer.classList.remove('hidden');
		document.getElementById('journal-story-catcher-container')?.classList.add('hidden');
		const dateInput = document.getElementById('input-journal-date');
		if (dateInput && !dateInput.value) {
			dateInput.value = getTodayDateString();
		}
	} else {
		formContainer.classList.add('hidden');
	}
}

async function saveCaregiverJournalEntry() {
	const dateEl = document.getElementById('input-journal-date');
	const promptEl = document.getElementById('input-journal-prompt');
	const wordsEl = document.getElementById('input-journal-words');
	const words = (wordsEl?.value || '').trim();
	if (!words) {
		alert('Please enter a memory or words to save.');
		return;
	}
	const dateStr = (dateEl?.value || '').trim() || getTodayDateString();
	const prompt = (promptEl?.value || '').trim() || 'Family Memory Note';

	await recordSeniorJournalEntry({
		dateStr,
		question: prompt,
		answer: words,
		notes: 'Added by Caregiver',
		source: 'caregiver_note',
		timestamp: Date.now(),
	});

	if (wordsEl) wordsEl.value = '';
	if (promptEl) promptEl.value = '';
	toggleAddJournalEntryForm();
	renderMemoryJournalEntries();
	showToast('Memory saved to journal!');
}

async function deleteJournalEntry(id) {
	if (!confirm('Are you sure you want to remove this memory entry?')) return;
	if (latestBoardData?.seniorJournal && latestBoardData.seniorJournal[id]) {
		delete latestBoardData.seniorJournal[id];
	}
	try {
		localStorage.setItem('smb_local_senior_journal', JSON.stringify(latestBoardData.seniorJournal || {}));
		await database.ref(`board/seniorJournal/${id}`).remove();
	} catch (e) {}
	updateAdminJournalCount();
	renderMemoryJournalEntries();
	showToast('Memory entry removed.');
}

function toggleRawTranscript(id) {
	const el = document.getElementById(`raw-transcript-${id}`);
	if (el) el.classList.toggle('hidden');
}

function renderMemoryJournalEntries() {
	const container = document.getElementById('journal-entries-container');
	if (!container) return;

	let journalMap = latestBoardData?.seniorJournal;
	if (!journalMap) {
		try {
			const raw = localStorage.getItem('smb_local_senior_journal');
			if (raw) journalMap = JSON.parse(raw);
		} catch (e) {}
	}

	const entries = Object.values(journalMap || {}).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

	updateAdminJournalCount();

	if (entries.length === 0) {
		container.innerHTML = `
			<div class="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
				<h3 class="text-base font-bold text-slate-800">No Memories Recorded Yet</h3>
				<p class="text-xs text-slate-500 max-w-sm mx-auto">
					As Mom shares stories on the board or during voice interviews, her memories will be saved chronologically right here.
				</p>
			</div>
		`;
		return;
	}

	container.innerHTML = entries
		.map((entry) => {
			const formattedDate = entry.timestamp
				? new Date(entry.timestamp).toLocaleDateString('en-US', {
						weekday: 'long',
						month: 'long',
						day: 'numeric',
						year: 'numeric',
				  })
				: entry.dateStr || 'Recorded Entry';

			const sourceBadge =
				entry.source === 'kiosk_voice'
					? `<span class="px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-bold">Spoken on Kiosk</span>`
					: entry.source === 'caregiver_interview'
					? `<span class="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-bold">Voice Interview</span>`
					: entry.notes
					? `<span class="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">${escapeHtml(entry.notes)}</span>`
					: '';

			const hasRaw =
				entry.rawTranscript &&
				entry.rawTranscript.trim() &&
				entry.rawTranscript.trim() !== (entry.answer || '').trim();

			return `
				<div class="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-3 transition">
					<div class="flex items-center justify-between border-b border-slate-100 pb-2">
						<div class="flex items-center gap-2">
							<span class="text-sm font-black text-blue-900">${escapeHtml(formattedDate)}</span>
							${sourceBadge}
						</div>
						<button
							type="button"
							onclick="deleteJournalEntry('${entry.id}')"
							class="text-slate-400 hover:text-rose-600 text-xs font-semibold p-1 cursor-pointer"
							title="Delete entry"
						>
							Delete
						</button>
					</div>

					<div class="space-y-2">
						${
							entry.storyTitle
								? `<h4 class="text-base sm:text-lg font-black text-indigo-950">${escapeHtml(entry.storyTitle)}</h4>`
								: ''
						}
						<div class="text-xs font-semibold text-slate-500">
							<strong>Topic:</strong> <em>"${escapeHtml(entry.question)}"</em>
						</div>
						<div class="text-sm sm:text-base font-bold text-slate-900 bg-blue-50/60 p-3 rounded-xl border border-blue-100 whitespace-pre-line leading-relaxed">
							"${escapeHtml(entry.answer)}"
						</div>
						${
							entry.followupAnswer
								? `
							<div class="pl-3 border-l-2 border-indigo-200 space-y-1 mt-2">
								<div class="text-xs text-slate-500 font-medium">Follow-up: <em>"${escapeHtml(entry.followupQuestion)}"</em></div>
								<div class="text-sm font-bold text-indigo-950">Mom: "${escapeHtml(entry.followupAnswer)}"</div>
							</div>
						`
								: ''
						}
						${
							hasRaw
								? `
							<div class="pt-1">
								<button
									type="button"
									onclick="toggleRawTranscript('${entry.id}')"
									class="text-[11px] text-slate-500 hover:text-indigo-600 font-medium underline cursor-pointer"
								>
									View original spoken words
								</button>
								<div id="raw-transcript-${entry.id}" class="hidden mt-1.5 p-2.5 bg-slate-100 rounded-lg text-xs font-mono text-slate-700 leading-relaxed">
									"${escapeHtml(entry.rawTranscript)}"
								</div>
							</div>
						`
								: ''
						}
					</div>
				</div>
			`;
		})
		.join('');
}

function downloadMemoryJournalMarkdown() {
	const entries = Object.values(latestBoardData?.seniorJournal || {}).sort(
		(a, b) => (a.timestamp || 0) - (b.timestamp || 0)
	);

	let md = `# Mom's Memory Journal\n`;
	md += `*A chronological keepsake diary of memories, reflections, and stories shared on the home message board.*\n`;
	md += `*Exported on ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}*\n\n`;
	md += `---\n\n`;

	if (entries.length === 0) {
		md += `*No memories recorded yet.*\n`;
	} else {
		entries.forEach((entry) => {
			const formattedDate = entry.timestamp
				? new Date(entry.timestamp).toLocaleDateString('en-US', {
						weekday: 'long',
						month: 'long',
						day: 'numeric',
						year: 'numeric',
				  })
				: entry.dateStr || 'Recorded Entry';

			const title = entry.storyTitle ? ` — ${entry.storyTitle}` : '';
			md += `### ${formattedDate}${title}\n`;
			md += `* **Topic / Question:** ${entry.question}\n`;
			if (entry.source === 'kiosk_voice') {
				md += `* **Recorded Via:** Spoken on Tablet Kiosk\n`;
			} else if (entry.source === 'caregiver_interview') {
				md += `* **Recorded Via:** Voice Interview with Family\n`;
			} else if (entry.notes) {
				md += `* **Family Note:** ${entry.notes}\n`;
			}
			md += `\n**Mom's Story:**\n\n${entry.answer}\n\n`;
			if (entry.followupAnswer) {
				md += `* **Follow-up:** ${entry.followupQuestion}\n`;
				md += `* **Choice:** ${entry.followupAnswer}\n\n`;
			}
			if (entry.rawTranscript && entry.rawTranscript !== entry.answer) {
				md += `> *Spoken Transcript:* "${entry.rawTranscript}"\n\n`;
			}
			md += `---\n\n`;
		});
	}

	const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `Mom-Memory-Journal-${getTodayDateString()}.md`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
	showToast('Markdown Memory Journal downloaded!');
}

function printMemoryJournal() {
	const entries = Object.values(latestBoardData?.seniorJournal || {}).sort(
		(a, b) => (a.timestamp || 0) - (b.timestamp || 0)
	);

	const printWin = window.open('', '_blank');
	if (!printWin) {
		alert('Please allow popups to print the Memory Journal.');
		return;
	}

	let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Mom's Memory Journal</title>`;
	html += `<style>
		body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; padding: 40px; max-width: 800px; margin: 0 auto; }
		h1 { font-size: 28px; margin-bottom: 4px; color: #0f172a; }
		.subtitle { font-size: 14px; color: #64748b; margin-bottom: 30px; font-style: italic; }
		.entry { border-bottom: 1px solid #e2e8f0; padding: 20px 0; page-break-inside: avoid; }
		.date { font-size: 16px; font-weight: bold; color: #1e3a8a; margin-bottom: 4px; }
		.title { font-size: 18px; font-weight: 900; color: #312e81; margin-bottom: 6px; }
		.prompt { font-size: 14px; color: #475569; margin-bottom: 6px; }
		.answer { font-size: 16px; font-weight: 600; color: #0f172a; background: #f8fafc; padding: 12px 16px; border-radius: 8px; border-left: 4px solid #3b82f6; margin-bottom: 8px; white-space: pre-line; }
		.followup { margin-left: 16px; font-size: 14px; color: #334155; }
		.note { font-size: 12px; color: #b45309; margin-top: 6px; }
		@media print { body { padding: 0; } }
	</style></head><body>`;

	html += `<h1>Mom's Memory Journal</h1>`;
	html += `<div class="subtitle">A keepsake record of thoughts and memories shared on the home message board &bull; Printed ${new Date().toLocaleDateString()}</div>`;

	if (entries.length === 0) {
		html += `<p><em>No memories recorded yet.</em></p>`;
	} else {
		entries.forEach((e) => {
			const formattedDate = e.timestamp
				? new Date(e.timestamp).toLocaleDateString('en-US', {
						weekday: 'long',
						month: 'long',
						day: 'numeric',
						year: 'numeric',
				  })
				: e.dateStr;

			html += `<div class="entry">`;
			html += `<div class="date">${escapeHtml(formattedDate)}</div>`;
			if (e.storyTitle) {
				html += `<div class="title">${escapeHtml(e.storyTitle)}</div>`;
			}
			html += `<div class="prompt"><strong>Topic:</strong> ${escapeHtml(e.question)}</div>`;
			html += `<div class="answer">${escapeHtml(e.answer)}</div>`;
			if (e.followupAnswer) {
				html += `<div class="followup"><strong>Follow-up:</strong> ${escapeHtml(e.followupQuestion)}<br><strong>Mom's Choice:</strong> "${escapeHtml(e.followupAnswer)}"</div>`;
			}
			if (e.notes) {
				html += `<div class="note"><strong>Note:</strong> ${escapeHtml(e.notes)}</div>`;
			}
			html += `</div>`;
		});
	}

	html += `</body></html>`;

	printWin.document.open();
	printWin.document.write(html);
	printWin.document.close();
	printWin.focus();
	setTimeout(() => {
		printWin.print();
	}, 250);
}

let lastSuggestedCreativeIndex = -1;

function suggestCreativeCheckinQuestion() {
	const qEl = document.getElementById('input-checkin-custom-question');
	const choicesEl = document.getElementById('input-checkin-custom-choices');
	if (!qEl || !choicesEl) return;

	const pool = CONVERSATIONAL_CHECKIN_TOPICS;
	lastSuggestedCreativeIndex = (lastSuggestedCreativeIndex + 1) % pool.length;
	const item = pool[lastSuggestedCreativeIndex];

	qEl.value = item.question;
	choicesEl.value = item.choices.join(', ');
	qEl.focus();
	showToast(`Loaded suggestion: "${item.question.slice(0, 30)}..."`);
}

function renderAdminCheckinResponse(resp, todayStr) {
	const respTextEl = document.getElementById('admin-checkin-response-text');
	const clearBtn = document.getElementById('btn-admin-clear-checkin');
	const activeQInfoEl = document.getElementById('admin-active-question-info');
	const historyEl = document.getElementById('admin-checkin-history');
	if (!respTextEl) return;

	// Show current active question info
	const activeTopic = getActiveCheckinTopic(latestBoardData);
	if (activeQInfoEl) {
		activeQInfoEl.innerHTML = `Active Prompt: <em>"${escapeHtml(activeTopic.question)}"</em> <span class="text-[10px] font-semibold text-slate-500">(${activeTopic.source || 'Conversation'})</span>`;
	}

	if (resp && resp.dateStr === todayStr && resp.answer) {
		const timeStr = resp.timestamp
			? new Date(resp.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
			: '';
		const followupText = resp.followupAnswer ? ` &bull; Follow-up: <strong>"${escapeHtml(resp.followupAnswer)}"</strong>` : '';
		respTextEl.innerHTML = `<strong>${escapeHtml(resp.answer)}</strong> (for <em>"${escapeHtml(resp.question || 'Daily Check-In')}"</em>${timeStr ? ' at ' + timeStr : ''})${followupText}`;
		if (clearBtn) clearBtn.classList.remove('hidden');
	} else {
		respTextEl.innerText = 'No response logged yet today.';
		if (clearBtn) clearBtn.classList.add('hidden');
	}

	// Render recent journal history preview
	if (historyEl) {
		let journalMap = latestBoardData?.seniorJournal;
		if (!journalMap) {
			try {
				const raw = localStorage.getItem('smb_local_senior_journal');
				if (raw) journalMap = JSON.parse(raw);
			} catch (e) {}
		}
		const entries = Object.values(journalMap || {})
			.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
			.slice(0, 3);

		if (entries.length > 0) {
			historyEl.innerHTML = '<strong>Recent Journal:</strong> ' + entries.map(h => `${escapeHtml(h.answer)} <span class="text-slate-400">(${h.dateStr})</span>`).join(' &bull; ');
			historyEl.classList.remove('hidden');
		} else {
			historyEl.classList.add('hidden');
		}
	}
}

async function adminClearSeniorResponse() {
	if (!confirm('Clear the senior response so they can answer again today?')) return;
	try {
		await database.ref('board/seniorResponse').remove();
		try {
			localStorage.removeItem('smb_local_senior_response');
		} catch (e) {}
		if (latestBoardData) latestBoardData.seniorResponse = null;
		renderSeniorCheckin(latestBoardData);
		showToast('Senior response cleared.');
	} catch (err) {
		alert('Failed to clear response: ' + err.message);
	}
}

// ================= STRUCTURED FAMILY MESSAGES MANAGEMENT =================

let editingMessageId = null;

function getTodayDateString() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function isMessageExpired(message, todayStr) {
	if (!message || !message.expirationDate) return false;
	const refToday = todayStr || getTodayDateString();
	return message.expirationDate < refToday;
}

function formatMessageDisplayDate(ts) {
	if (!ts) return '';
	const d = new Date(ts);
	if (isNaN(d.getTime())) return '';
	const now = new Date();
	const isToday =
		d.getDate() === now.getDate() &&
		d.getMonth() === now.getMonth() &&
		d.getFullYear() === now.getFullYear();
	const timePart = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	if (isToday) {
		return `Today • ${timePart}`;
	}
	const datePart = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
	return `${datePart} • ${timePart}`;
}

function getDefaultAuthorName() {
	return (
		userProfile?.displayName ||
		userProfile?.relationship ||
		currentUser?.displayName ||
		(currentUser?.email ? currentUser.email.split('@')[0] : 'Family')
	);
}

function getStructuredMessagesList(boardData) {
	const data = boardData || latestBoardData || {};
	if (data.messages && typeof data.messages === 'object') {
		return Object.entries(data.messages).map(([id, m]) => ({
			id,
			text: m.text || '',
			author: m.author || 'Family',
			authorUid: m.authorUid || '',
			createdAt: m.createdAt || m.updatedAt || 0,
			updatedAt: m.updatedAt || m.createdAt || 0,
			expirationDate: m.expirationDate || '',
		}));
	}
	return [];
}

function renderMessagesCard(boardData) {
	const data = boardData || latestBoardData || {};
	const container = document.getElementById('disp-messages');
	const countBadge = document.getElementById('messages-count-badge');
	if (!container) return;

	const allMessages = getStructuredMessagesList(data);
	const todayStr = getTodayDateString();
	// Filter out expired messages on the senior display
	const activeMessages = allMessages.filter((m) => !isMessageExpired(m, todayStr));
	// Newest first
	activeMessages.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

	if (countBadge) {
		if (activeMessages.length > 0) {
			countBadge.innerText = `${activeMessages.length} ${activeMessages.length === 1 ? 'Message' : 'Messages'}`;
			countBadge.classList.remove('hidden');
		} else {
			countBadge.classList.add('hidden');
		}
	}

	if (activeMessages.length === 0) {
		container.innerHTML = `
			<div class="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-1">
				<div class="text-xl sm:text-2xl font-black text-slate-800">No messages yet</div>
				<div class="text-sm sm:text-base font-semibold text-slate-500">Family can post messages from their phones or computers.</div>
			</div>
		`;
		return;
	}

	container.innerHTML = activeMessages
		.map((msg) => {
			const formattedDate = formatMessageDisplayDate(msg.createdAt);
			return `
				<div class="p-5 sm:p-6 bg-gradient-to-br from-blue-50/90 to-indigo-50/60 rounded-2xl border-2 border-blue-200 space-y-3 shadow-2xs">
					<p class="text-2xl sm:text-3xl font-bold text-slate-950 leading-relaxed whitespace-pre-line">${escapeHtml(msg.text)}</p>
					<div class="flex items-center justify-between text-base sm:text-lg text-slate-600 pt-3 border-t-2 border-blue-100 flex-wrap gap-2">
						<span class="font-black text-blue-900 flex items-center gap-2">
							With love from ${escapeHtml(msg.author || 'Family')}
						</span>
						<span class="font-semibold text-slate-500">${escapeHtml(formattedDate)}</span>
					</div>
				</div>
			`;
		})
		.join('');
}

function renderAdminMessagesList() {
	const adminContainer = document.getElementById('admin-messages-list');
	if (!adminContainer) return;

	const allMessages = getStructuredMessagesList(latestBoardData);
	allMessages.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

	if (allMessages.length === 0) {
		adminContainer.innerHTML = '<div class="text-center py-4 text-xs text-slate-400 italic">No messages posted yet.</div>';
		return;
	}

	const todayStr = getTodayDateString();

	adminContainer.innerHTML = allMessages
		.map((msg) => {
			const expired = isMessageExpired(msg, todayStr);
			const formattedDate = formatMessageDisplayDate(msg.createdAt);
			let expirationBadge = '';
			if (msg.expirationDate) {
				if (expired) {
					expirationBadge = `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">Expired (${escapeHtml(msg.expirationDate)})</span>`;
				} else {
					expirationBadge = `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Expires: ${escapeHtml(msg.expirationDate)}</span>`;
				}
			}

			return `
				<div class="p-3 bg-white rounded-xl border ${expired ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200'} flex items-start justify-between gap-2.5 shadow-2xs">
					<div class="space-y-1 min-w-0 flex-1">
						<p class="text-xs sm:text-sm text-slate-900 font-medium leading-snug line-clamp-3">${escapeHtml(msg.text)}</p>
						<div class="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
							<span class="font-bold text-blue-700">From ${escapeHtml(msg.author || 'Family')}</span>
							<span>•</span>
							<span>${escapeHtml(formattedDate)}</span>
							${expirationBadge}
						</div>
					</div>
					<div class="flex items-center gap-1 shrink-0 pt-0.5">
						<button
							type="button"
							onclick="startEditMessage('${escapeHtml(msg.id).replace(/'/g, "\\'")}')"
							class="text-blue-600 hover:text-blue-800 text-xs font-semibold px-2 py-1 rounded-md hover:bg-blue-50 transition cursor-pointer"
						>
							Edit
						</button>
						<button
							type="button"
							onclick="deleteMessageItem('${escapeHtml(msg.id).replace(/'/g, "\\'")}')"
							class="text-rose-600 hover:text-rose-800 text-xs font-semibold px-2 py-1 rounded-md hover:bg-rose-50 transition cursor-pointer"
						>
							Delete
						</button>
					</div>
				</div>
			`;
		})
		.join('');
}

function startEditMessage(messageId) {
	const messagesList = getStructuredMessagesList(latestBoardData);
	const msg = messagesList.find((m) => m.id === messageId);
	if (!msg) return;

	editingMessageId = messageId;

	const textInput = document.getElementById('input-message-text');
	const authorInput = document.getElementById('input-message-author');
	const expInput = document.getElementById('input-message-expiration');
	const formContainer = document.getElementById('message-form-container');
	const formHeading = document.getElementById('message-form-heading');
	const editingBadge = document.getElementById('message-editing-badge');
	const cancelBtn = document.getElementById('btn-cancel-edit-message');
	const saveBtnText = document.getElementById('btn-save-message-text');

	if (textInput) textInput.value = msg.text || '';
	if (authorInput) authorInput.value = msg.author || '';
	if (expInput) expInput.value = msg.expirationDate || '';

	if (formHeading) formHeading.innerText = 'Edit Message';
	if (editingBadge) editingBadge.classList.remove('hidden');
	if (cancelBtn) cancelBtn.classList.remove('hidden');
	if (saveBtnText) saveBtnText.innerText = 'Save Message Changes';
	if (formContainer) {
		formContainer.className = 'p-3 bg-blue-50/50 rounded-xl border-2 border-blue-400 space-y-3 transition-colors';
		formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}

	if (textInput) textInput.focus();
}

function cancelEditMessage() {
	editingMessageId = null;

	const textInput = document.getElementById('input-message-text');
	const authorInput = document.getElementById('input-message-author');
	const expInput = document.getElementById('input-message-expiration');
	const formContainer = document.getElementById('message-form-container');
	const formHeading = document.getElementById('message-form-heading');
	const editingBadge = document.getElementById('message-editing-badge');
	const cancelBtn = document.getElementById('btn-cancel-edit-message');
	const saveBtnText = document.getElementById('btn-save-message-text');

	if (textInput) textInput.value = '';
	if (authorInput) authorInput.value = getDefaultAuthorName();
	if (expInput) expInput.value = '';

	if (formHeading) formHeading.innerText = 'Post a New Message';
	if (editingBadge) editingBadge.classList.add('hidden');
	if (cancelBtn) cancelBtn.classList.add('hidden');
	if (saveBtnText) saveBtnText.innerText = 'Post Message';
	if (formContainer) {
		formContainer.className = 'p-3 bg-white rounded-xl border border-slate-200 space-y-3 transition-colors';
	}
}

async function saveMessageItem() {
	if (!userProfile || (userProfile.role !== 'ADMIN' && userProfile.role !== 'EDITOR')) {
		alert('Permission Denied: Only ADMIN and EDITOR users can post or edit messages.');
		return;
	}

	const textInput = document.getElementById('input-message-text');
	const authorInput = document.getElementById('input-message-author');
	const expInput = document.getElementById('input-message-expiration');

	const text = textInput ? textInput.value.trim() : '';
	const author = authorInput ? authorInput.value.trim() || getDefaultAuthorName() : getDefaultAuthorName();
	const expirationDate = expInput ? expInput.value.trim() : '';

	if (!text) {
		alert('Please enter a message.');
		if (textInput) textInput.focus();
		return;
	}

	const isEditing = !!editingMessageId;
	const messageId = editingMessageId || `msg_${Date.now()}`;

	try {
		if (isEditing) {
			await database.ref(`board/messages/${messageId}`).update({
				text,
				author,
				expirationDate,
				updatedAt: Date.now(),
				updatedBy: userProfile?.displayName || currentUser?.email || 'Caregiver',
			});
			showToast('Message updated successfully!');
		} else {
			await database.ref(`board/messages/${messageId}`).set({
				id: messageId,
				text,
				author,
				authorUid: currentUser?.uid || '',
				expirationDate,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				createdBy: userProfile?.displayName || currentUser?.email || 'Caregiver',
			});
			showToast('Message posted successfully!');
		}

		cancelEditMessage();

		if (latestBoardData?.aiAutoRefresh !== false) {
			generateAiActionPlan({ silent: true });
		}
	} catch (err) {
		console.error('Failed to save message:', err);
		alert('Error saving message: ' + err.message);
	}
}

async function deleteMessageItem(messageId) {
	if (!userProfile || (userProfile.role !== 'ADMIN' && userProfile.role !== 'EDITOR')) {
		alert('Permission Denied: Only ADMIN and EDITOR users can delete messages.');
		return;
	}

	const messagesList = getStructuredMessagesList(latestBoardData);
	const msg = messagesList.find((m) => m.id === messageId);
	const preview = msg ? (msg.text.length > 30 ? msg.text.slice(0, 30) + '...' : msg.text) : 'this message';

	if (!confirm(`Delete message "${preview}"?`)) return;

	try {
		await database.ref(`board/messages/${messageId}`).remove();
		if (editingMessageId === messageId) {
			cancelEditMessage();
		}
		showToast('Message deleted.');

		if (latestBoardData?.aiAutoRefresh !== false) {
			generateAiActionPlan({ silent: true });
		}
	} catch (err) {
		console.error('Failed to delete message:', err);
		alert('Error deleting message: ' + err.message);
	}
}

// ================= STRUCTURED MEDICATIONS MANAGEMENT =================

let editingMedicationId = null;

function getStructuredMedicationsList(boardData) {
	const data = boardData || latestBoardData || {};
	if (data.medicationList && typeof data.medicationList === 'object') {
		return Object.entries(data.medicationList).map(([id, m]) => ({
			id,
			name: m.name || '',
			time: m.time || '',
			notes: m.notes || '',
			createdAt: m.createdAt || m.updatedAt || 0,
		}));
	}
	return [];
}

function renderMedicationsCard(boardData) {
	const data = boardData || latestBoardData || {};
	const container = document.getElementById('disp-medications');
	const countBadge = document.getElementById('medications-count-badge');
	const generalNotesEl = document.getElementById('disp-medications-general-notes');
	if (!container) return;

	const generalNotes = (data.medicationNotes || '').trim();
	if (generalNotesEl) {
		if (generalNotes) {
			generalNotesEl.innerHTML = `
				<div class="flex items-start gap-1.5">
					<span class="text-sm sm:text-base font-black uppercase tracking-wider text-purple-900 shrink-0">Note:</span>
					<span class="text-base sm:text-lg text-purple-950 font-bold leading-snug">${escapeHtml(generalNotes)}</span>
				</div>
			`;
			generalNotesEl.classList.remove('hidden');
		} else {
			generalNotesEl.classList.add('hidden');
			generalNotesEl.innerHTML = '';
		}
	}

	const medsList = getStructuredMedicationsList(data);

	if (countBadge) {
		if (medsList.length > 0) {
			countBadge.innerText = `${medsList.length} ${medsList.length === 1 ? 'Med' : 'Meds'}`;
			countBadge.classList.remove('hidden');
		} else {
			countBadge.classList.add('hidden');
		}
	}

	if (medsList.length === 0) {
		container.innerHTML = `
			<div class="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-1">
				<div class="text-xl sm:text-2xl font-black text-slate-800">No medications listed</div>
				<div class="text-sm sm:text-base font-semibold text-slate-500">Add medications in the caregiver panel.</div>
			</div>
		`;
		return;
	}

	container.innerHTML = medsList
		.map(
			(med) => `
			<div class="p-5 sm:p-6 bg-purple-50/40 rounded-2xl border-2 border-purple-200 space-y-2">
				<div class="flex items-center justify-between gap-3 flex-wrap">
					<span class="font-black text-2xl sm:text-3xl text-slate-950">${escapeHtml(med.name)}</span>
					${
						med.time
							? `<span class="text-base sm:text-lg font-black px-3.5 py-1 rounded-xl bg-purple-100 text-purple-950 border border-purple-300 shrink-0">${escapeHtml(med.time)}</span>`
							: `<span class="text-base sm:text-lg font-black px-3.5 py-1 rounded-xl bg-purple-100 text-purple-950 border border-purple-300 shrink-0">Morning</span>`
					}
				</div>
				${
					med.notes
						? `<p class="text-xl sm:text-2xl text-slate-700 leading-relaxed font-bold pl-0.5">${escapeHtml(med.notes)}</p>`
						: ''
				}
			</div>
		`
		)
		.join('');
}

function renderAdminMedicationsList() {
	const adminContainer = document.getElementById('admin-medications-list');
	if (!adminContainer) return;

	const medsList = getStructuredMedicationsList(latestBoardData);

	if (medsList.length === 0) {
		adminContainer.innerHTML = '<div class="text-center py-4 text-xs text-slate-400 italic">No medications added yet.</div>';
		return;
	}

	adminContainer.innerHTML = medsList
		.map(
			(med) => `
			<div class="p-2.5 bg-white rounded-xl border border-slate-200 flex items-start justify-between gap-2 shadow-2xs">
				<div class="space-y-0.5 min-w-0 flex-1">
					<div class="flex items-center gap-2 flex-wrap">
						<span class="font-bold text-sm text-slate-900 truncate">${escapeHtml(med.name)}</span>
						${
							med.time
								? `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">${escapeHtml(med.time)}</span>`
								: ''
						}
					</div>
					${
						med.notes
							? `<p class="text-xs text-slate-500 leading-snug truncate">${escapeHtml(med.notes)}</p>`
							: ''
					}
				</div>
				<div class="flex items-center gap-1 shrink-0 pt-0.5">
					<button
						type="button"
						onclick="startEditMedication('${escapeHtml(med.id).replace(/'/g, "\\'")}')"
						class="text-blue-600 hover:text-blue-800 text-xs font-semibold px-2 py-1 rounded-md hover:bg-blue-50 transition cursor-pointer"
					>
						Edit
					</button>
					<button
						type="button"
						onclick="deleteMedicationItem('${escapeHtml(med.id).replace(/'/g, "\\'")}')"
						class="text-rose-600 hover:text-rose-800 text-xs font-semibold px-2 py-1 rounded-md hover:bg-rose-50 transition cursor-pointer"
					>
						Delete
					</button>
				</div>
			</div>
		`
		)
		.join('');
}

function startEditMedication(medId) {
	const medsList = getStructuredMedicationsList(latestBoardData);
	const med = medsList.find((m) => m.id === medId);
	if (!med) return;

	editingMedicationId = medId;

	const nameInput = document.getElementById('input-med-name');
	const timeInput = document.getElementById('input-med-time');
	const notesInput = document.getElementById('input-med-notes');
	const formContainer = document.getElementById('med-form-container');
	const formHeading = document.getElementById('med-form-heading');
	const editingBadge = document.getElementById('med-editing-badge');
	const cancelBtn = document.getElementById('btn-cancel-edit-med');
	const saveBtnText = document.getElementById('btn-save-med-text');

	if (nameInput) nameInput.value = med.name || '';
	if (timeInput) timeInput.value = med.time || '';
	if (notesInput) notesInput.value = med.notes || '';

	if (formHeading) formHeading.innerText = 'Edit Medication';
	if (editingBadge) editingBadge.classList.remove('hidden');
	if (cancelBtn) cancelBtn.classList.remove('hidden');
	if (saveBtnText) saveBtnText.innerText = 'Save Medication Changes';
	if (formContainer) {
		formContainer.className = 'p-3 bg-purple-50/50 rounded-xl border-2 border-purple-400 space-y-3 transition-colors';
		formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}

	if (nameInput) nameInput.focus();
}

function cancelEditMedication() {
	editingMessageId = null;

	const nameInput = document.getElementById('input-med-name');
	const timeInput = document.getElementById('input-med-time');
	const notesInput = document.getElementById('input-med-notes');
	const formContainer = document.getElementById('med-form-container');
	const formHeading = document.getElementById('med-form-heading');
	const editingBadge = document.getElementById('med-editing-badge');
	const cancelBtn = document.getElementById('btn-cancel-edit-med');
	const saveBtnText = document.getElementById('btn-save-med-text');

	if (nameInput) nameInput.value = '';
	if (timeInput) timeInput.value = '';
	if (notesInput) notesInput.value = '';

	if (formHeading) formHeading.innerText = 'Add New Medication';
	if (editingBadge) editingBadge.classList.add('hidden');
	if (cancelBtn) cancelBtn.classList.add('hidden');
	if (saveBtnText) saveBtnText.innerText = 'Add Medication';
	if (formContainer) {
		formContainer.className = 'p-3 bg-white rounded-xl border border-slate-200 space-y-3 transition-colors';
	}
}

async function saveMedicationItem() {
	const nameInput = document.getElementById('input-med-name');
	const timeInput = document.getElementById('input-med-time');
	const notesInput = document.getElementById('input-med-notes');

	const name = (nameInput?.value || '').trim();
	const time = (timeInput?.value || '').trim();
	const notes = (notesInput?.value || '').trim();

	if (!name) {
		alert('Please enter a medication name.');
		if (nameInput) nameInput.focus();
		return;
	}

	const medId = editingMedicationId || `med_${Date.now()}`;

	const medItem = {
		id: medId,
		name,
		time,
		notes,
		updatedAt: Date.now(),
	};

	if (!latestBoardData) latestBoardData = {};
	if (!latestBoardData.medicationList) latestBoardData.medicationList = {};
	latestBoardData.medicationList[medId] = medItem;

	try {
		await database.ref(`board/medicationList/${medId}`).set(medItem);
		showToast(`Medication "${name}" saved!`);
	} catch (err) {
		console.warn('Firebase medication save error:', err);
		showToast(`Saved locally: "${name}"`);
	}

	cancelEditMedication();
	renderMedicationsCard(latestBoardData);
	renderAdminMedicationsList();
}

async function deleteMedicationItem(medId) {
	const medsList = getStructuredMedicationsList(latestBoardData);
	const med = medsList.find((m) => m.id === medId);
	const name = med ? med.name : 'this medication';

	if (!confirm(`Are you sure you want to delete ${name}?`)) return;

	if (latestBoardData?.medicationList && latestBoardData.medicationList[medId]) {
		delete latestBoardData.medicationList[medId];
	}

	try {
		await database.ref(`board/medicationList/${medId}`).remove();
		showToast(`Medication "${name}" deleted.`);
	} catch (err) {
		console.warn('Firebase medication delete error:', err);
		showToast(`Deleted: "${name}"`);
	}

	if (editingMedicationId === medId) {
		cancelEditMedication();
	}

	renderMedicationsCard(latestBoardData);
	renderAdminMedicationsList();
}

function renderBoard(data) {
	latestBoardData = data || {};

	// Update Display Screen Elements
	document.getElementById('disp-board-title').innerText =
		data.boardTitle || 'Senior Message Board';

	// Main announcement card (hidden if empty)
	const announcement = (data.announcement || '').trim();
	const announceContainer = document.getElementById('disp-announcement-container');
	const announceEl = document.getElementById('disp-announcement');

	if (announcement) {
		if (announceEl) announceEl.innerText = announcement;
		if (announceContainer) announceContainer.classList.remove('hidden');
	} else {
		if (announceContainer) announceContainer.classList.add('hidden');
		if (announceEl) announceEl.innerText = '';
	}

	// Apply display card ordering (Position 1 to 4)
	applyCardPositions(data.cardPositions);

	// Update Contacts state from board
	currentBoardUserContacts = data.userContacts || {};
	currentAdditionalContacts = data.contacts || {};
	renderContacts();

	renderMessagesCard(data);
	renderAdminMessagesList();
	const msgAuthorInput = document.getElementById('input-message-author');
	if (msgAuthorInput && !msgAuthorInput.value && !editingMessageId) {
		msgAuthorInput.value = getDefaultAuthorName();
	}
	renderMedicationsCard(data);
	renderAdminMedicationsList();

	// Update Weather
	if (data.zipcode) {
		updateWeather(data.zipcode);
	}

	// Update Medication Action State (in Header Card)
	const medBtn = document.getElementById('btn-take-meds');
	const medBadge = document.getElementById('meds-status-badge');
	const medTime = document.getElementById('meds-taken-time');
	const medInstr = document.getElementById('meds-instruction');

	if (data.medsTaken) {
		if (medBtn) {
			medBtn.className =
				'w-full px-6 py-4 sm:py-5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-2 border-emerald-300 font-black rounded-2xl transition-all flex items-center justify-center gap-2 text-2xl sm:text-3xl lg:text-4xl shadow-none';
			medBtn.innerHTML = '<span>MEDS LOGGED</span>';
		}
		if (medBadge) medBadge.classList.remove('hidden');
		if (medTime) {
			medTime.classList.remove('hidden');
			if (data.medsTakenTime) {
				const dateObj = new Date(data.medsTakenTime);
				const time = dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
				medTime.innerText = `Logged today at ${time}`;
			} else {
				medTime.innerText = 'Logged for today';
			}
		}
		if (medInstr) {
			medInstr.innerText = 'All done: Medications are logged for today.';
			medInstr.className =
				'bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2';
		}
	} else {
		if (medBtn) {
			medBtn.className =
				'w-full px-6 py-4 sm:py-5 bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white font-black rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 text-2xl sm:text-3xl lg:text-4xl cursor-pointer';
			medBtn.innerHTML = '<span>I TOOK MY MEDS</span>';
		}
		if (medBadge) medBadge.classList.add('hidden');
		if (medTime) medTime.classList.add('hidden');
		if (medInstr) {
			medInstr.innerText = 'Please take your medicine.';
			medInstr.className =
				'bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2';
		}
	}
	// Populate Announcement Input for both Admin and Editor
	const announceInput = document.getElementById('input-announcement');
	if (announceInput && document.activeElement !== announceInput) {
		announceInput.value = data.announcement || '';
	}

	// Populate Maintenance & AI Summary Inputs if user is admin or editor
	if (userProfile && (userProfile.role === 'ADMIN' || userProfile.role === 'EDITOR')) {
				const titleEl = document.getElementById('input-board-title');
		if (titleEl && document.activeElement !== titleEl) titleEl.value = data.boardTitle || 'Senior Message Board';

		// Prune legacy transition data from Firebase
		if (data.reminders !== undefined) {
			database.ref('board/reminders').remove().catch(() => {});
		}
		if (data.medications !== undefined) {
			database.ref('board/medications').remove().catch(() => {});
		}
		if (data.cardPositions && data.cardPositions.reminders !== undefined) {
			database.ref('board/cardPositions/reminders').remove().catch(() => {});
		}

		const medNotesEl = document.getElementById('input-medication-notes');
		if (medNotesEl && document.activeElement !== medNotesEl) {
			medNotesEl.value = data.medicationNotes || '';
		}
		const medTakenEl = document.getElementById('input-meds-taken');
		if (medTakenEl) medTakenEl.checked = data.medsTaken || false;
		const zipEl = document.getElementById('input-zipcode');
		if (zipEl && document.activeElement !== zipEl) zipEl.value = data.zipcode || '';
		const aiRulesEl = document.getElementById('input-ai-rules');
		if (aiRulesEl && document.activeElement !== aiRulesEl) {
			aiRulesEl.value = data.aiRules !== undefined ? data.aiRules : DEFAULT_AI_RULES;
		}
		const aiFeedbackEl = document.getElementById('input-ai-feedback');
		if (aiFeedbackEl && document.activeElement !== aiFeedbackEl) {
			aiFeedbackEl.value = data.aiFeedback || '';
		}
		const customQEl = document.getElementById('input-checkin-custom-question');
		if (customQEl && document.activeElement !== customQEl) {
			customQEl.value = data.customCheckinQuestion || '';
		}
		const customChoicesEl = document.getElementById('input-checkin-custom-choices');
		if (customChoicesEl && document.activeElement !== customChoicesEl) {
			customChoicesEl.value = data.customCheckinChoices || '';
		}
		const apiKeyEl = document.getElementById('input-gemini-api-key');
		if (apiKeyEl && document.activeElement !== apiKeyEl && !apiKeyEl.value) {
			apiKeyEl.value = loadGeminiApiKeyLocal();
		}
	}

	// Notify on Medication Completion Transition
	if (previousMedsTaken !== null && previousMedsTaken === false && data.medsTaken === true) {
		if (userProfile && userProfile.notifyOnMeds) {
			notifyMedicationTaken(data.medsTakenTime);
		}
	}
	previousMedsTaken = !!data.medsTaken;

	// Render Calendar Events & Appointments
	renderEvents(data.events || {});

	// Render Senior Daily Check-In
	renderSeniorCheckin(data);

	// Update Admin Journal Count Badge
	updateAdminJournalCount();

	// Render AI Daily Action Plan & Prep Card
	renderAiSummaryCard();

	// Update Kiosk Navigation Badges & Page Status
	updateKioskNavBadges(data);

	// Auto-Reset Check
	checkAutoReset(data.medsTaken, data.medsTakenTime);
}

// Auto-reset meds status if it's a new day
function checkAutoReset(isTaken, takenTime) {
	if (isTaken && takenTime) {
		const lastTakenDate = new Date(takenTime).toDateString();
		const todayDate = new Date().toDateString();

		if (lastTakenDate !== todayDate) {
			console.log('New day detected. Resetting medication status...');
			database.ref('board').update({
				medsTaken: false,
			});
		}
	}
}

// Medication Interaction Logic

function markMedsTaken() {
	console.log('Marking meds as taken...');
	if (!latestBoardData) latestBoardData = {};
	latestBoardData.medsTaken = true;
	latestBoardData.medsTakenTime = Date.now();
	renderBoard(latestBoardData);

	database.ref('board').update(
		{
			medsTaken: true,
			medsTakenTime: Date.now(),
		},
		(error) => {
			if (error) console.error('Error marking meds taken:', error);
			else console.log('Meds status updated successfully.');
		}
	);
}

// Save Data to Firebase

function saveData() {
	console.log('Attempting to save board data...');
	if (!userProfile || (userProfile.role !== 'ADMIN' && userProfile.role !== 'EDITOR')) {
		alert('Permission Denied: You do not have permission to modify board content.');
		return;
	}

	const announcement = document.getElementById('input-announcement').value;
	const boardTitle = document.getElementById('input-board-title').value;
	const medicationNotes = (document.getElementById('input-medication-notes')?.value || '').trim();
	const medsTaken = document.getElementById('input-meds-taken').checked;
	const zipcode = document.getElementById('input-zipcode').value;
	const aiRules = (document.getElementById('input-ai-rules')?.value ?? DEFAULT_AI_RULES).trim();
	const aiFeedback = (document.getElementById('input-ai-feedback')?.value ?? '').trim();
	const customCheckinQuestion = (document.getElementById('input-checkin-custom-question')?.value ?? '').trim();
	const customCheckinChoices = (document.getElementById('input-checkin-custom-choices')?.value ?? '').trim();

	// Recompute fresh Smart Plan from the newly edited form fields
	const freshSmartPlan = buildSmartRuleBasedPlan({
		...latestBoardData,
		announcement,
		medsTaken,
		aiRules,
		aiFeedback,
		customCheckinQuestion,
		customCheckinChoices,
	});

	const updatePayload = {
		boardTitle: boardTitle,
		announcement: announcement,
		medicationNotes: medicationNotes,
		medsTaken: medsTaken,
		zipcode: zipcode,
		aiRules: aiRules,
		aiFeedback: aiFeedback,
		customCheckinQuestion: customCheckinQuestion,
		customCheckinChoices: customCheckinChoices,
		aiAutoRefresh: true,
		aiSummary: {
			todayPlan: freshSmartPlan.todayPlan,
			prepAlerts: freshSmartPlan.prepAlerts,
			lookAhead: freshSmartPlan.lookAhead,
			source: 'smart',
			generatedDate: getTodayDateString(),
			updatedAt: Date.now(),
		},
		updatedAt: Date.now(),
	};

	if (userProfile.role === 'ADMIN') {
		updatePayload.cardPositions = currentCardPositions;
	}

	// Delete legacy transition data in Firebase
	database.ref('board/reminders').remove().catch(() => {});
	database.ref('board/medications').remove().catch(() => {});
	database.ref('board/cardPositions/reminders').remove().catch(() => {});

	database.ref('board').update(
		updatePayload,
		(error) => {
			if (error) {
				console.error('Firebase Save Error:', error);
				alert('Failed to save changes. ERROR: ' + error.message);
			} else {
				console.log('Board data saved successfully.');
				if (loadGeminiApiKeyLocal()) {
					generateAiActionPlan({ silent: true });
				}
				alert('Changes published successfully! Tablet will update instantly.');
				switchView('display');
			}
		}
	);
}

// ================= AI DAILY ACTION PLAN & SMART PREP ENGINE =================

function getDaysFromToday(dateStr) {
	if (!dateStr) return null;
	const parts = dateStr.split('-').map(Number);
	if (parts.length !== 3) return null;
	const target = new Date(parts[0], parts[1] - 1, parts[2]);
	target.setHours(0, 0, 0, 0);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getEventEffectiveEndDate(evt) {
	if (!evt || !evt.date) return '';
	return evt.endDate && evt.endDate >= evt.date ? evt.endDate : evt.date;
}

function isEventOnToday(evt, todayStr) {
	if (!evt || !evt.date) return false;
	const t = todayStr || getTodayDateString();
	const endStr = getEventEffectiveEndDate(evt);
	return evt.date <= t && endStr >= t;
}

function isEventUpcomingOrActive(evt, todayStr) {
	if (!evt || !evt.date) return false;
	const t = todayStr || getTodayDateString();
	return getEventEffectiveEndDate(evt) >= t;
}

function getEventDaysFromToday(evt) {
	if (!evt || !evt.date) return null;
	const todayStr = getTodayDateString();
	if (isEventOnToday(evt, todayStr)) return 0;
	return getDaysFromToday(evt.date);
}

function detectEventCategory(title) {
	const t = (title || '').toLowerCase();
	if (/family|visit|lunch|dinner|friend|grandkid|grandchild|son|daughter|party|coffee|tea|hangout|sister|brother|nephew|niece/i.test(t)) {
		return 'family';
	}
	if (/plumber|electrician|repair|pest|delivery|cleaner|contractor|technician|cable|roof|hvac|maintenance/i.test(t)) {
		return 'service';
	}
	if (/haircut|salon|barber|grocery|groceries|shopping|store|church|bank|pharmacy|post office|library|errand/i.test(t)) {
		return 'errand';
	}
	if (/dr|doctor|exam|eye|pt|therapy|dental|dentist|infusion|blood|lab|clinic|hospital|cardio|podiatrist|nurse|checkup|specialist|ortho/i.test(t)) {
		return 'medical';
	}
	return 'other';
}

function detectEventLocation(title, category) {
	const cat = category || detectEventCategory(title);
	const t = (title || '').toLowerCase();
	if (cat === 'family' || cat === 'service') {
		if (/out|restaurant|cafe|dinner at|lunch at|at /i.test(t)) {
			return 'outing';
		}
		return 'home';
	}
	if (cat === 'errand' || cat === 'medical') {
		if (/home visit|home nurse|telehealth|phone appt|virtual|at home/i.test(t)) {
			return 'home';
		}
		return 'outing';
	}
	return 'outing';
}

function getEventContext(evt) {
	if (!evt) return { category: 'medical', location: 'outing' };
	let category = evt.category;
	let location = evt.location;
	if (!category) {
		category = detectEventCategory(evt.title || '');
	}
	if (!location) {
		location = detectEventLocation(evt.title || '', category);
	}
	return { category, location };
}

function setupEventFormAutoDetect() {
	const titleInput = document.getElementById('input-event-title');
	if (titleInput && !titleInput.dataset.listenerAttached) {
		titleInput.dataset.listenerAttached = 'true';
		titleInput.addEventListener('input', () => {
			if (editingEventId) return; // Do not overwrite when editing an existing event
			const detectedCat = detectEventCategory(titleInput.value);
			const detectedLoc = detectEventLocation(titleInput.value, detectedCat);
			const catSelect = document.getElementById('input-event-category');
			const locSelect = document.getElementById('input-event-location');
			if (catSelect && detectedCat) catSelect.value = detectedCat;
			if (locSelect && detectedLoc) locSelect.value = detectedLoc;
		});
	}
}

function getUpcomingBirthdayDiffDays(bdayStr) {
	if (!bdayStr) return null;
	const parts = bdayStr.split('-').map(Number);
	if (parts.length < 3) return null;
	const month = parts[1];
	const day = parts[2];
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	let target = new Date(today.getFullYear(), month - 1, day);
	target.setHours(0, 0, 0, 0);
	if (target.getTime() < today.getTime()) {
		target = new Date(today.getFullYear() + 1, month - 1, day);
	}
	return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getWeatherSummaryWithoutNumbers(weatherData) {
	if (!weatherData) {
		return 'A calm and comfortable day ahead. **Take things at your own easy pace** and keep some water nearby.';
	}

	const code = typeof weatherData.code === 'number' ? weatherData.code : -1;
	const high = typeof weatherData.high === 'number' ? weatherData.high : null;
	const rainChance = typeof weatherData.rainChanceMax === 'number' ? weatherData.rainChanceMax : 0;
	const desc = (weatherData.desc || '').toLowerCase();

	// 1. Thunderstorms or Severe Weather
	if (code === 95 || code === 96 || code === 99 || desc.includes('thunder')) {
		return 'Stormy skies with passing thunderstorms expected today. **Stay safe and cozy indoors** and enjoy a relaxing book or show.';
	}

	// 2. Snow / Sleet / Freezing Rain
	if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86) || desc.includes('snow') || desc.includes('flurr')) {
		return 'Wintry, freezing conditions with snow today. **Stay warm indoors** and **wear non-slip shoes** if you need to step outside.';
	}

	// 3. Rain / Showers / Drizzle
	if (
		(code >= 51 && code <= 67) ||
		(code >= 80 && code <= 82) ||
		rainChance >= 60 ||
		desc.includes('rain') ||
		desc.includes('drizzle') ||
		desc.includes('shower')
	) {
		return 'Rainy, damp weather expected today. **Wear non-slip shoes** and **take an umbrella** if heading out.';
	}

	// 4. Temperature feel (Strictly zero numbers, no digits, no degrees, no percentages)
	if (high !== null) {
		if (high >= 85) {
			return 'Very warm to hot afternoon ahead. **Stay cool indoors during peak afternoon heat** and **keep a cold water glass nearby**.';
		}
		if (high >= 75) {
			return 'Warm and pleasant sunshine today. **Drink an extra glass of water** and enjoy the cooler morning hours.';
		}
		if (high < 45) {
			return 'Brisk and cold outside today. **Dress in warm layers** and enjoy the sunshine from inside.';
		}
		if (high < 60) {
			return 'Crisp and cool throughout the day. **Put on a warm cardigan or jacket** if stepping out for fresh air.';
		}
		// High between 60 and 74 (Mild / comfortable)
		if (code === 0 || code === 1 || desc.includes('clear') || desc.includes('sun')) {
			return 'Mild, bright, and sunny today. **Step out on the porch for some fresh air** during the nicest part of the day.';
		}
		if (code === 2 || code === 3 || desc.includes('cloud')) {
			return 'Mild with comfortable cloud cover today. **Enjoy an easy stroll outside** or relax comfortably at home.';
		}
		return 'Comfortable and pleasant weather today. **Take a light walk or relax on the porch** to enjoy the day.';
	}

	// 5. Fallback based on condition description or general feel
	if (desc.includes('sun') || desc.includes('clear')) {
		return 'Bright sunshine today. **Step outside for some gentle fresh air** and stay well-hydrated.';
	}
	if (desc.includes('cloud') || desc.includes('overcast')) {
		return 'Mild and cloudy today. **Take things at an easy pace** and keep a glass of water nearby.';
	}

	return 'A calm and comfortable day ahead. **Take things at your own easy pace** and keep some water nearby.';
}

function formatActionBulletHtml(text) {
	if (!text) return '';
	let safe = escapeHtml(text);
	safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong class="font-black text-slate-950">$1</strong>');
	safe = safe.replace(/&lt;strong&gt;(.*?)&lt;\/strong&gt;/gi, '<strong class="font-black text-slate-950">$1</strong>');
	safe = safe.replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/gi, '<strong class="font-black text-slate-950">$1</strong>');
	return safe;
}

function buildSmartRuleBasedPlan(boardData) {
	const data = boardData || latestBoardData || {};
	const todayStr = getTodayDateString();
	const todayPlan = [];
	const prepAlerts = [];

	const feedback = (data.aiFeedback || latestBoardData?.aiFeedback || '').toLowerCase();
	const seniorResp =
		data.seniorResponse && data.seniorResponse.dateStr === todayStr
			? data.seniorResponse
			: null;

	// Bullet 1: Natural weather feel with bolded action (Zero numbers)
	const weatherBullet = getWeatherSummaryWithoutNumbers(lastWeatherData);
	todayPlan.push(weatherBullet);

	// Bullet 2: Medication status & morning hydration advice
	const medNotes = (data.medicationNotes || '').trim();
	const medsList = getStructuredMedicationsList(data);
	let medBullet = '';
	if (data.medsTaken) {
		medBullet =
			'Morning medicine is logged as taken. **Take your evening medicine after dinner** and sip water throughout the day.';
	} else {
		if (medsList.length > 0) {
			medBullet =
				'**Take your morning medicine with breakfast** and drink a full glass of water.';
		} else {
			medBullet =
				'**Take your daily medicine when ready** and drink a full glass of water to start your day.';
		}
	}
	if (medNotes) {
		medBullet += ` (${medNotes.replace(/[.!]+$/, '')})`;
	}
	todayPlan.push(medBullet);

	// Schedule & Events context
	const allEvents = Object.entries(currentEventsMap || {})
		.map(([id, evt]) => ({
			id,
			...evt,
			diffDays: getEventDaysFromToday(evt),
		}))
		.filter((evt) => evt.diffDays !== null && evt.diffDays >= 0)
		.sort((a, b) => {
			if (a.diffDays !== b.diffDays) return a.diffDays - b.diffDays;
			return (a.time || '').localeCompare(b.time || '');
		});

	const todayEvents = allEvents.filter((e) => e.diffDays === 0);
	const { allContacts } = getCombinedContactsList();
	const todaysBirthdays = allContacts.filter((c) => isBirthdayToday(c.birthday));
	const todaysHolidays = (upcomingHolidays || []).filter((h) => h.date === todayStr);

	// Bullet 3: Today's Appointments & Schedule Pacing
	if (todayEvents.length > 0) {
		const firstEvt = todayEvents[0];
		const { category, location } = getEventContext(firstEvt);
		let timeStr = '';
		if (firstEvt.time) {
			const [h, m] = firstEvt.time.split(':').map(Number);
			const d = new Date();
			d.setHours(h, m, 0, 0);
			timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
		}
		const titleStr = firstEvt.title || 'appointment';
		const driverNote = (firstEvt.notes || '').trim();
		const reminderNote = (firstEvt.reminder || '').trim();

		let evtBullet = '';
		if (category === 'family') {
			if (location === 'home') {
				evtBullet = `${titleStr}${timeStr ? ' at ' + timeStr : ''} today. **Put on a fresh kettle of tea** and enjoy an unhurried morning.`;
			} else {
				evtBullet = `Getting together for ${titleStr}${timeStr ? ' at ' + timeStr : ''}. **Have a light meal beforehand** and enjoy your visit.`;
			}
		} else if (category === 'service') {
			evtBullet = `Home service visit scheduled today for ${titleStr}${timeStr ? ' at ' + timeStr : ''}. **Keep a clear walkway to the door** and your phone nearby.`;
		} else if (category === 'errand') {
			evtBullet = `Outing for ${titleStr}${timeStr ? ' at ' + timeStr : ''}. **Wear comfortable walking shoes** and take your time.`;
		} else {
			// Medical or General Outing
			if (location === 'home') {
				evtBullet = `Home healthcare visit for ${titleStr}${timeStr ? ' at ' + timeStr : ''}. **Have your daily medication list handy**.`;
			} else {
				evtBullet = `${titleStr}${timeStr ? ' at ' + timeStr : ''}. **Bring your ID, glasses, and insurance card** with you.`;
			}
		}

		if (reminderNote) {
			evtBullet += ` **Remember**: ${reminderNote.replace(/[.!]+$/, '')}.`;
		}
		if (driverNote && !driverNote.toLowerCase().includes('driving')) {
			evtBullet += ` Note: ${driverNote.replace(/[.!]+$/, '')}.`;
		}
		todayPlan.push(evtBullet);
	} else if (todaysBirthdays.length > 0) {
		const names = todaysBirthdays.map((c) => c.name).join(' and ');
		todayPlan.push(
			`Today is ${names}'s birthday! **Call them this afternoon** to wish them a very happy birthday.`
		);
	} else if (todaysHolidays.length > 0) {
		todayPlan.push(
			`Happy ${todaysHolidays[0].name}! **Treat yourself today** and keep your phone handy for family calls.`
		);
	} else {
		const activeMsgs = getStructuredMessagesList(data).filter((m) => !isMessageExpired(m, todayStr));
		const hasCallReminder = activeMsgs.some((m) => (m.text || '').toLowerCase().includes('call'));
		if (hasCallReminder) {
			todayPlan.push(
				'An open, restful day with no scheduled outings. **Call family this afternoon** to catch up.'
			);
		} else if (feedback.includes('puzzle') || feedback.includes('no walk') || feedback.includes('avoid walk')) {
			todayPlan.push(
				'An unhurried schedule at home today. **Enjoy your favorite puzzles or books** and take things easy.'
			);
		} else {
			todayPlan.push(
				'An unhurried schedule at home today. **Take a gentle walk around the house** every couple of hours.'
			);
		}
	}

	// Multi-Day Prep Coaching (0 to 4 days out)
	const rulesText = data.aiRules !== undefined ? data.aiRules : DEFAULT_AI_RULES;
	const customRules = [];
	(rulesText || '')
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.forEach((line) => {
			const colonIdx = line.indexOf(':');
			if (colonIdx > 0 && colonIdx < 40) {
				const keyword = line.slice(0, colonIdx).trim().toLowerCase();
				const instruction = line.slice(colonIdx + 1).trim();
				if (keyword && instruction) {
					customRules.push({ keyword, instruction });
				}
			}
		});

	allEvents.forEach((evt) => {
		if (evt.diffDays > 4) return;
		const combinedText = `${evt.title || ''} ${evt.notes || ''} ${evt.reminder || ''}`.toLowerCase();
		const whenPhrase =
			evt.diffDays === 0
				? 'today'
				: evt.diffDays === 1
				? 'tomorrow'
				: `in ${evt.diffDays} days`;

		if (evt.reminder && evt.reminder.trim()) {
			prepAlerts.push(
				`For ${evt.title} (${whenPhrase}): ${evt.reminder.trim()}`
			);
		}

		if (
			evt.diffDays <= 3 &&
			(combinedText.includes('infusion') ||
				combinedText.includes(' iv ') ||
				combinedText.startsWith('iv ') ||
				combinedText.includes('hydration'))
		) {
			if (evt.diffDays === 0) {
				prepAlerts.push(
					'Sip water this morning and wear a loose-sleeved top with a warm layer for your infusion today.'
				);
			} else {
				prepAlerts.push(
					`Drink 2 to 3 extra glasses of water today so you are well-hydrated for your infusion ${whenPhrase}.`
				);
			}
			return;
		}

		if (
			evt.diffDays <= 2 &&
			(combinedText.includes('blood') ||
				combinedText.includes('lab') ||
				combinedText.includes('fasting'))
		) {
			prepAlerts.push(
				`Drink extra water today for your lab visit ${whenPhrase}, and check if you need to fast before going.`
			);
			return;
		}

		if (
			evt.diffDays <= 1 &&
			(combinedText.includes('physical therapy') ||
				combinedText.includes(' pt ') ||
				combinedText.startsWith('pt ') ||
				combinedText.includes('therapy') ||
				combinedText.includes('rehab'))
		) {
			prepAlerts.push(
				`Rest your legs and set out supportive walking shoes for therapy ${whenPhrase}.`
			);
			return;
		}

		if (
			evt.diffDays <= 2 &&
			(combinedText.includes('eye') ||
				combinedText.includes('optom') ||
				combinedText.includes('ophthalm'))
		) {
			prepAlerts.push(
				`Bring your everyday glasses and sunglasses for your eye visit ${whenPhrase}.`
			);
			return;
		}

		const evtCtx = getEventContext(evt);
		if (evtCtx.category === 'family' && evt.diffDays >= 1 && evt.diffDays <= 2 && (!evt.reminder || !evt.reminder.trim())) {
			prepAlerts.push(
				`Looking forward to ${evt.title} ${whenPhrase} — take time to rest up today so you have plenty of energy for company.`
			);
			return;
		}

		if (evt.diffDays <= 3) {
			customRules.forEach((rule) => {
				if (
					!['infusion', 'blood draw', 'physical therapy'].includes(rule.keyword) &&
					combinedText.includes(rule.keyword)
				) {
					prepAlerts.push(`Prep for ${whenPhrase}: ${rule.instruction}`);
				}
			});
		}
	});

	if (todayEvents.length > 0 && lastWeatherData) {
		if (lastWeatherData.code >= 51 && lastWeatherData.code <= 65) {
			prepAlerts.push(
				'Wear non-slip shoes and bring an umbrella for your trip out today.'
			);
		} else if (lastWeatherData.temp < 48 || (lastWeatherData.code >= 71 && lastWeatherData.code <= 75)) {
			prepAlerts.push(
				'Bundle up with a warm coat and gloves before heading out today.'
			);
		}
	}

	// Look-ahead pacing context
	const upcomingSoonEvents = allEvents.filter((e) => e.diffDays >= 1 && e.diffDays <= 5);
	const upcomingSoonHolidays = (upcomingHolidays || []).filter((h) => {
		const d = getDaysFromToday(h.date);
		return d !== null && d >= 1 && d <= 5;
	});
	const upcomingSoonBirthdays = allContacts
		.map((c) => ({ ...c, diffDays: getUpcomingBirthdayDiffDays(c.birthday) }))
		.filter((c) => c.diffDays !== null && c.diffDays >= 1 && c.diffDays <= 5)
		.sort((a, b) => a.diffDays - b.diffDays);

	const lookAheadParts = [];
	if (upcomingSoonEvents.length === 0) {
		lookAheadParts.push(
			'Your next few days are clear of appointments — enjoy a restful, unhurried week at home.'
		);
	} else {
		const tomorrowEvents = upcomingSoonEvents.filter((e) => e.diffDays === 1);
		if (tomorrowEvents.length > 0) {
			const tomEvt = tomorrowEvents[0];
			const tomCtx = getEventContext(tomEvt);
			if (tomCtx.category === 'family') {
				lookAheadParts.push(
					`Look forward to seeing family tomorrow (${tomEvt.title}) — enjoy a restful evening tonight.`
				);
			} else {
				lookAheadParts.push(
					'Lay out your clothes tonight and get a good night of sleep so tomorrow morning feels easy.'
				);
			}
		} else {
			const nextEvt = upcomingSoonEvents[0];
			const nextCtx = getEventContext(nextEvt);
			if (nextCtx.category === 'family') {
				lookAheadParts.push(
					`You have family visiting in ${nextEvt.diffDays} days (${nextEvt.title}) — look forward to a wonderful time together.`
				);
			} else {
				lookAheadParts.push(
					`Enjoy a quiet stretch at home before your next outing in ${nextEvt.diffDays} days.`
				);
			}
		}
	}

	if (upcomingSoonBirthdays.length > 0) {
		const b = upcomingSoonBirthdays[0];
		const whenStr = b.diffDays === 1 ? 'tomorrow' : `in ${b.diffDays} days`;
		lookAheadParts.push(
			`${b.name}'s birthday is ${whenStr} — a great time to plan a quick phone call.`
		);
	} else if (upcomingSoonHolidays.length > 0) {
		const h = upcomingSoonHolidays[0];
		const d = getDaysFromToday(h.date);
		const whenStr = d === 1 ? 'tomorrow' : `in ${d} days`;
		lookAheadParts.push(`${h.name} arrives ${whenStr} — look forward to catching up with family.`);
	}

	// Paragraph 4: Family Love Notes & Messages (Idea D)
	const activeMsgs = getStructuredMessagesList(data).filter((m) => !isMessageExpired(m, todayStr));
	if (activeMsgs.length > 0) {
		const latestMsg = activeMsgs[0];
		const authorName = (latestMsg.author || 'Family').trim();
		const msgText = (latestMsg.text || '').trim();
		if (msgText) {
			const cleanMsg = msgText.replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
			todayPlan.push(
				`${authorName} sent a loving note: "${cleanMsg}." **Enjoy hearing from family** today.`
			);
		}
	}

	// Paragraph 5 (Optional): Proactive Prep or Senior Check-In Reflection
	if (prepAlerts.length > 0) {
		let cleanAlert = prepAlerts[0].replace(/^[\p{Emoji}\s]+/u, '').trim();
		if (!cleanAlert.includes('**')) {
			cleanAlert = cleanAlert.replace(
				/^(Drink [^.,]+|Wear [^.,]+|Bundle up [^.,]+|Rest [^.,]+|Bring [^.,]+|Set out [^.,]+|Confirm [^.,]+|Take [^.,]+)/i,
				'**$1**'
			);
		}
		todayPlan.push(cleanAlert);
	} else if (seniorResp && seniorResp.answer) {
		const qLower = (seniorResp.question || '').toLowerCase();
		const ansText = seniorResp.answer;
		const isEscape = ansText.toLowerCase().includes('not sure') || ansText.toLowerCase().includes('none');
		if (seniorResp.isStory) {
			todayPlan.push(`We loved hearing your story "${ansText}". **Enjoy some comforting music** this afternoon.`);
		} else if (isEscape) {
			todayPlan.push('Thank you for checking in this morning. **Take things easy today** and enjoy an unhurried afternoon.');
		} else if (qLower.includes('dinner') || qLower.includes('eat') || qLower.includes('food')) {
			todayPlan.push(`Dinner preference noted: ${ansText}. **Enjoy a comforting dinner** this evening.`);
		} else if (qLower.includes('song') || qLower.includes('music') || qLower.includes('radio')) {
			todayPlan.push(`Your memory of ${ansText} is such a treasure. **Put on some favorite music** today and hum along.`);
		} else {
			todayPlan.push(`We loved hearing your reflection: "${ansText}". **Have a wonderful, restful day**.`);
		}
	}

	return {
		todayPlan,
		prepAlerts,
		lookAhead: lookAheadParts.join(' '),
	};
}

function getEffectiveAiSummary() {
	const data = latestBoardData || {};
	const smartPlan = buildSmartRuleBasedPlan(data);
	const saved = data.aiSummary || {};
	const autoRefresh = data.aiAutoRefresh !== false;
	const isSavedFromToday = saved.generatedDate === getTodayDateString();

	// When Auto-Refresh is enabled (default), always reflect live board changes immediately
	// unless a fresh Gemini AI summary was just generated today.
	if (autoRefresh) {
		if (!isSavedFromToday || saved.source !== 'gemini') {
			return {
				todayPlan: [...smartPlan.todayPlan],
				prepAlerts: [...smartPlan.prepAlerts],
				lookAhead: smartPlan.lookAhead,
			};
		}
	}

	let todayPlan =
		Array.isArray(saved.todayPlan) && saved.todayPlan.length > 0
			? [...saved.todayPlan]
			: [...smartPlan.todayPlan];

	let prepAlerts =
		Array.isArray(saved.prepAlerts) && saved.prepAlerts.length > 0
			? [...saved.prepAlerts]
			: [...smartPlan.prepAlerts];

	let lookAhead =
		saved.lookAhead && saved.lookAhead.trim() ? saved.lookAhead.trim() : smartPlan.lookAhead;

	if (autoRefresh && isSavedFromToday) {
		// Merge any newly added live appointment prep alerts into a Gemini summary
		smartPlan.prepAlerts.forEach((liveAlert) => {
			const prefix = liveAlert.slice(0, 22).toLowerCase();
			const alreadyPresent = prepAlerts.some((p) => p.toLowerCase().includes(prefix));
			if (!alreadyPresent) {
				prepAlerts.push(liveAlert);
			}
		});
	}

	return { todayPlan, prepAlerts, lookAhead };
}

function renderAiSummaryCard() {
	const todayPlanEl = document.getElementById('disp-ai-today-plan');
	const prepAlertsEl = document.getElementById('disp-ai-prep-alerts');
	const lookAheadEl = document.getElementById('disp-ai-look-ahead');
	if (!todayPlanEl) return;

	const { todayPlan, prepAlerts, lookAhead } = getEffectiveAiSummary();

	if (!todayPlan || todayPlan.length === 0) {
		todayPlanEl.innerHTML = `
			<p class="text-xl sm:text-2xl font-medium text-slate-800 leading-relaxed">
				Good morning! Wishing you a peaceful and comfortable start to your day.
			</p>
			<p class="text-xl sm:text-2xl font-medium text-slate-800 leading-relaxed">
				Take your day at a gentle pace. <strong class="font-black text-slate-950">Keep a glass of water nearby</strong> and enjoy a relaxing day.
			</p>
		`;
	} else {
		todayPlanEl.innerHTML = todayPlan
			.map((item) => {
				const formatted = formatActionBulletHtml(item);
				return `
					<p class="text-xl sm:text-2xl font-medium text-slate-800 leading-relaxed">
						${formatted}
					</p>
				`;
			})
			.join('');
	}

	if (prepAlertsEl) {
		if (prepAlerts.length === 0) {
			prepAlertsEl.innerHTML = `
				<div class="p-2.5 sm:p-3 bg-white/90 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-600 leading-snug font-medium">
					No special appointment prep needed right now.
				</div>
			`;
		} else {
			prepAlertsEl.innerHTML = prepAlerts
				.map(
					(alertText) => `
					<div class="p-3 bg-sky-50 rounded-xl border border-sky-300 text-sky-950 text-base font-bold">
						${escapeHtml(alertText)}
					</div>
				`
				)
				.join('');
		}
	}

	if (lookAheadEl) {
		lookAheadEl.innerText =
			lookAhead ||
			'Your next few days are open and unhurried — enjoy a restful week at home.';
	}
}

async function generateAiActionPlan(options = {}) {
	const silent = !!options.silent;
	const btn = document.getElementById('btn-generate-ai-plan');
	const btnText = document.getElementById('btn-generate-ai-text');
	const apiKeyInput = document.getElementById('input-gemini-api-key');
	const apiKey = (apiKeyInput?.value || loadGeminiApiKeyLocal() || '').trim();
	if (apiKeyInput && apiKey) {
		saveGeminiApiKeyLocal(apiKey);
	}

	const rulesEl = document.getElementById('input-ai-rules');
	const rulesText = (rulesEl?.value || latestBoardData?.aiRules || DEFAULT_AI_RULES).trim();
	const todayStr = getTodayDateString();

	// Build the smart baseline context first
	const smartBaseline = buildSmartRuleBasedPlan({
		...latestBoardData,
		aiRules: rulesText,
	});

	if (!apiKey) {
		// Instant Smart Care Companion generation using built-in conversational topics
		const dayOfYear = getDayOfYear();
		const fallbackTopic =
			CONVERSATIONAL_CHECKIN_TOPICS[dayOfYear % CONVERSATIONAL_CHECKIN_TOPICS.length];
		const smartAiQuestion = {
			question: fallbackTopic.question,
			choices: fallbackTopic.choices,
			generatedDate: todayStr,
			updatedAt: Date.now(),
		};

		if (userProfile && (userProfile.role === 'ADMIN' || userProfile.role === 'EDITOR')) {
			const updatePayload = {
				aiRules: rulesText,
				aiSummary: {
					todayPlan: smartBaseline.todayPlan,
					prepAlerts: smartBaseline.prepAlerts,
					lookAhead: smartBaseline.lookAhead,
					source: 'smart',
					generatedDate: todayStr,
					updatedAt: Date.now(),
				},
				aiQuestion: smartAiQuestion,
			};
			await Promise.race([
				database.ref('board').update(updatePayload),
				new Promise((resolve) => setTimeout(resolve, 5000)),
			]).catch((e) => console.warn('Database save warning:', e));
		}
		if (latestBoardData) {
			latestBoardData.aiQuestion = smartAiQuestion;
		}
		renderAiSummaryCard();
		renderSeniorCheckin(latestBoardData);
		if (!silent) {
			showToast('Conversational Action Plan refreshed!');
		}
		return;
	}

	// Call Gemini 3.8 Flash via the official Gemini Interactions API
	if (btn) btn.disabled = true;
	if (btnText) btnText.innerText = 'Generating with Gemini AI...';

	try {
		if (!lastWeatherData && latestBoardData?.zipcode) {
			try {
				await Promise.race([
					updateWeather(latestBoardData.zipcode),
					new Promise((resolve) => setTimeout(resolve, 5000)),
				]);
			} catch (e) {
				console.warn('Weather refresh before AI plan failed:', e);
			}
		}

		const { allContacts } = getCombinedContactsList();
		const upcomingEventsList = Object.values(currentEventsMap || {})
			.filter((e) => isEventUpcomingOrActive(e, todayStr))
			.map((e) => {
				const ctx = getEventContext(e);
				return {
					title: e.title,
					category: ctx.category,
					location: ctx.location,
					date: e.date,
					endDate: e.endDate || undefined,
					time: e.time || undefined,
					notes: e.notes || undefined,
					reminder: e.reminder || undefined,
				};
			})
			.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

		const boardSnapshot = {
			todayDate: todayStr,
			announcement: document.getElementById('input-announcement')?.value || latestBoardData.announcement || '',
			familyMessages: (() => {
				const msgs = getStructuredMessagesList(latestBoardData);
				return msgs
					.filter((m) => !isMessageExpired(m, todayStr))
					.map((m) => `${m.text} (from ${m.author}, posted ${formatMessageDisplayDate(m.createdAt)})`);
			})(),
			medications: getStructuredMedicationsList(latestBoardData)
				.map((m) => `${m.name}${m.time ? ' (' + m.time + ')' : ''}${m.notes ? ' - Note: ' + m.notes : ''}`)
				.join('\n'),
			medicationInstructions: latestBoardData?.medicationNotes || '',
			medsTakenToday: !!latestBoardData.medsTaken,
			seniorJournalMemories: Object.values(latestBoardData?.seniorJournal || {})
				.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
				.slice(0, 10)
				.map((j) => ({
					date: j.dateStr,
					title: j.storyTitle || undefined,
					prompt: j.question,
					reflection: j.answer,
					notes: j.notes || undefined,
				})),
			seniorRecentHistoryAndFeedback: Object.values(latestBoardData?.seniorHistory || {})
				.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
				.slice(0, 6)
				.map((h) => ({ date: h.dateStr, question: h.question, answered: h.answer })),
			seniorCheckIn: (latestBoardData?.seniorResponse && latestBoardData.seniorResponse.dateStr === todayStr) ? {
				question: latestBoardData.seniorResponse.question,
				answer: latestBoardData.seniorResponse.answer,
				timeLogged: new Date(latestBoardData.seniorResponse.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
			} : null,
			caregiverNotesAndFeedback: (document.getElementById('input-ai-feedback')?.value || latestBoardData?.aiFeedback || '').trim(),
			weatherForecast: lastWeatherData ? {
				currentTemp: `${lastWeatherData.temp}\u00B0F`,
				high: `${lastWeatherData.high}\u00B0F`,
				low: `${lastWeatherData.low}\u00B0F`,
				condition: lastWeatherData.desc,
				morningCurve: lastWeatherData.morning,
				afternoonPeak: lastWeatherData.afternoon,
				eveningWindDown: lastWeatherData.evening,
				rainTimingAndLikelihood: lastWeatherData.rainTiming,
				bestOutdoorWindow: lastWeatherData.bestWindow,
			} : 'Weather not loaded yet',
			upcomingAppointments: upcomingEventsList,
			upcomingHolidays: (upcomingHolidays || []).slice(0, 4),
			contactsAndBirthdays: allContacts.map((c) => ({
				name: c.name,
				relation: c.relation,
				birthday: c.birthday,
				isBirthdayToday: isBirthdayToday(c.birthday),
			})),
			caregiverPrepRules: rulesText,
			detectedSmartPrepAlerts: smartBaseline.prepAlerts,
		};

		const systemInstructionText =
			'You are a loving, thoughtful family member speaking directly to an 80+ senior ("you") on their home message board.\n' +
			'The senior has early-stage Alzheimer\'s disease. Your voice is warm, gentle, colloquial, and completely human.\n' +
			'STRICT ACCESSIBILITY & ALZHEIMER\'S GUIDELINES:\n' +
			'- NEVER quiz or test short-term recall (e.g. NEVER say "Do you remember what you had for breakfast?" or "What did we talk about yesterday?").\n' +
			'- Avoid long paragraphs or dense text blocks. High visual spacing and short 1-2 sentence paragraphs prevent disorientation.\n' +
			'- Zero emojis anywhere.\n\n' +
			'CRITICAL RULES:\n' +
			'1. `todayPlan` (AN ARRAY OF 2 TO 5 SHORT, SPACED PARAGRAPHS - NO BULLET POINTS, NO EMOJIS):\n' +
			'   - PARAGRAPH 1 (WEATHER & MORNING OUTLOOK): Describe how today feels naturally. CRITICAL: DO NOT use ANY numbers, digits (0-9), degree symbols, or percentages. E.g. "Crisp, sunny weather today with cool afternoon air. **Put on a warm sweater** before sitting out on the porch."\n' +
			'   - PARAGRAPH 2 (MEDICATION & HYDRATION): Note morning medication status and hydration advice with bold markdown **action text**, e.g. "**Take your morning medicine with breakfast** and drink a full glass of water."\n' +
			'   - PARAGRAPH 3 (SCHEDULE & PACING): Thoughts tailored to today\'s schedule (family visit, errand, doctor, or a restful quiet day at home).\n' +
			'   - PARAGRAPH 4 (FAMILY LOVE NOTES - IDEA D): If family messages exist in `familyMessages`, warmly weave their loving words into a short paragraph, e.g. "Sarah sent a sweet note: \'[message text]\'. **Have a wonderful day** knowing your family is thinking of you."\n' +
			'   - PARAGRAPH 5 (OPTIONAL PREP OR JOURNAL REFLECTION): Multi-day prep (e.g. extra hydration before infusion) OR celebrate a reflection from `seniorJournalMemories` without quizzing her (e.g. "We loved your memory of baking peach pies. **Enjoy some comforting music** this afternoon.").\n' +
			'2. `dailyQuestion`: CONVERSATIONAL NOSTALGIC CHECK-IN:\n' +
			'   - Sparks enduring long-term memories (music, classic radio, childhood treats, baking aromas, hometown memories, scenic views, cozy moments).\n' +
			'   - STRICTLY FORBIDDEN: NEVER ask generic questions like "What are your plans?", "What are you doing today?", or "What sounds good for dinner?".\n' +
			'   - Choices must include 3 distinct nostalgic/warm choices plus 1 low-pressure escape choice (e.g. "Not sure today" or "None of these"). Under 6 words each. Zero emojis.\n' +
			'3. `prepAlerts`: 1 to 2 short proactive reminders for upcoming appointments (e.g. extra hydration before an infusion).\n' +
			'4. `lookAhead`: Exactly 1 warm sentence on pacing the next few days.\n\n' +
			'Output MUST be a valid JSON object with keys: "todayPlan" (array of strings), "prepAlerts" (array of strings), "lookAhead" (string), "dailyQuestion" (object with "question" string and "choices" array of strings).';

		const requestPayload = {
			systemInstruction: {
				parts: [{ text: systemInstructionText }],
			},
			contents: [
				{
					parts: [
						{
							text:
								'Write a concise, conversational Daily Companion & Action Plan JSON from this live board context:\n' +
								JSON.stringify(boardSnapshot, null, 2),
						},
					],
				},
			],
			generationConfig: {
				responseMimeType: 'application/json',
			},
		};

		const rawJsonText = await callGeminiApi(apiKey, requestPayload, 'gemini-3.8-flash');
		const cleanJson = rawJsonText.replace(/```json\n?|\n?```/g, '').trim();
		const parsed = JSON.parse(cleanJson);
		const finalTodayPlan =
			Array.isArray(parsed.todayPlan) && parsed.todayPlan.length >= 2
				? parsed.todayPlan.slice(0, 5)
				: smartBaseline.todayPlan;
		const finalPrepAlerts =
			Array.isArray(parsed.prepAlerts) && parsed.prepAlerts.length > 0
				? parsed.prepAlerts
				: smartBaseline.prepAlerts;
		const finalLookAhead = parsed.lookAhead || smartBaseline.lookAhead;

		const rawAiQ = parsed.dailyQuestion;
		const finalAiQuestion =
			rawAiQ &&
			rawAiQ.question &&
			!isRepetitiveLegacyQuestion(rawAiQ.question) &&
			Array.isArray(rawAiQ.choices) &&
			rawAiQ.choices.length >= 2
				? {
						question: rawAiQ.question.trim(),
						choices: rawAiQ.choices.map((c) => c.trim()).filter(Boolean),
						generatedDate: todayStr,
						updatedAt: Date.now(),
				  }
				: null;

		if (userProfile && (userProfile.role === 'ADMIN' || userProfile.role === 'EDITOR')) {
			const updatePayload = {
				aiRules: rulesText,
				aiSummary: {
					todayPlan: finalTodayPlan,
					prepAlerts: finalPrepAlerts,
					lookAhead: finalLookAhead,
					source: 'gemini',
					generatedDate: todayStr,
					updatedAt: Date.now(),
				},
			};
			if (finalAiQuestion) {
				updatePayload.aiQuestion = finalAiQuestion;
			}
			await Promise.race([
				database.ref('board').update(updatePayload),
				new Promise((resolve) => setTimeout(resolve, 5000)),
			]).catch((e) => console.warn('Database save warning:', e));
		}
		if (finalAiQuestion && latestBoardData) {
			latestBoardData.aiQuestion = finalAiQuestion;
		}
		renderAiSummaryCard();
		renderSeniorCheckin(latestBoardData);
		if (!silent) {
			showToast('Gemini AI Action Plan refreshed!');
		}
	} catch (err) {
		console.error('Gemini AI generation error, falling back to Smart Plan:', err);
		renderAiSummaryCard();
		if (!silent) {
			alert(
				'Used built-in Smart Plan (Gemini API returned an error: ' +
					err.message +
					').'
			);
		}
	} finally {
		if (btn) btn.disabled = false;
		if (btnText) btnText.innerText = 'Refresh AI Summary Now';
	}
}

// Profile Management in Admin Panel
async function saveUserProfile() {
	if (!currentUser) return;
	const name = document.getElementById('input-profile-name').value.trim();
	const phone = (document.getElementById('input-profile-phone')?.value || '').trim();
	const relationship = (document.getElementById('input-profile-relation')?.value || '').trim();
	const birthday = document.getElementById('input-profile-birthday')?.value || '';
	const notifyMeds = document.getElementById('input-profile-notify-meds').checked;
	const statusEl = document.getElementById('profile-save-status');

	try {
		if (!userProfile) userProfile = {};
		userProfile.displayName = name;
		userProfile.phone = phone;
		userProfile.relationship = relationship;
		userProfile.birthday = birthday;
		userProfile.notifyOnMeds = notifyMeds;

		await database.ref(`users/${currentUser.uid}`).update({
			displayName: name,
			phone: phone,
			relationship: relationship,
			birthday: birthday,
			notifyOnMeds: notifyMeds,
		});

		if (userProfile.role === 'ADMIN' || userProfile.role === 'EDITOR') {
			await syncCurrentUserContactToBoard();
		}

		if (currentUser.updateProfile) {
			await currentUser.updateProfile({ displayName: name });
		}

		updateUserBadge();

		if (notifyMeds && 'Notification' in window && Notification.permission !== 'granted') {
			requestBrowserNotificationPermission();
		}

		if (statusEl) {
			statusEl.classList.remove('hidden');
			setTimeout(() => statusEl.classList.add('hidden'), 4000);
		}
	} catch (err) {
		console.error('Error saving profile:', err);
		alert('Failed to save profile: ' + err.message);
	}
}

function updateUserBadge() {
	const badge = document.getElementById('user-info-badge');
	const textEl = document.getElementById('user-info-text');
	if (!badge || !textEl || !currentUser) return;

	const name =
		userProfile?.displayName ||
		currentUser.displayName ||
		(currentUser.email ? currentUser.email.split('@')[0] : 'User');
	const role = userProfile?.role || 'VIEWER';
	textEl.innerText = `${name} (${role})`;
	badge.classList.remove('hidden');
}

// ==========================================
// Contact & User Normalization Utilities
// ==========================================
function normalizeUserContact(u, fallbackEmail = '') {
	if (!u) return null;
	const email = u.email || fallbackEmail || '';
	return {
		displayName: u.displayName || (email ? email.split('@')[0] : 'User'),
		email: email,
		phone: u.phone || '',
		relationship: u.relationship || '',
		birthday: u.birthday || '',
		role: u.role || 'VIEWER',
		active: u.active !== false,
	};
}

function normalizeContactRecord(raw, id, isUser = false) {
	if (!raw) return null;
	return {
		id: String(id || ''),
		isUser: Boolean(isUser),
		name: isUser
			? (raw.displayName || (raw.email ? raw.email.split('@')[0] : 'User'))
			: (raw.name || 'Unnamed Contact'),
		relation: isUser
			? (raw.relationship || raw.role || 'USER')
			: (raw.relation || ''),
		phone: raw.phone || '',
		email: raw.email || '',
		birthday: raw.birthday || '',
	};
}

async function syncCurrentUserContactToBoard() {
	if (!currentUser || !userProfile || userProfile.active === false) return;
	if (userProfile.role !== 'ADMIN' && userProfile.role !== 'EDITOR') return;
	const contactData = normalizeUserContact(userProfile, currentUser.email);
	try {
		await database.ref('board/userContacts/' + currentUser.uid).update(contactData);
	} catch (err) {
		console.warn('Could not sync user contact to board:', err);
	}
}

function syncUsersDirectoryToBoard(usersData) {
	if (!userProfile || userProfile.role !== 'ADMIN') return;
	const syncedMap = {};
	Object.entries(usersData || {}).forEach(([uid, u]) => {
		if (!u || u.active === false) return;
		syncedMap[uid] = normalizeUserContact(u);
	});
	database.ref('board/userContacts').set(syncedMap);
}

// User Management & Roles Functions (Admin Only)
let usersListenerAttached = false;

function initUsersManagement() {
	if (usersListenerAttached) return;
	usersListenerAttached = true;

	database.ref('users').on(
		'value',
		(snapshot) => {
			liveUsersData = snapshot.val() || {};
			syncUsersDirectoryToBoard(liveUsersData);
			renderUsersTable(liveUsersData);
			renderContacts();
			renderTodayColumn();
		},
		(err) => {
			console.warn('Could not read users directory:', err);
			const tbody = document.getElementById('users-table-body');
			if (tbody) {
				tbody.innerHTML = `<div class="p-4 text-center text-xs text-rose-600 bg-rose-50 rounded-xl border border-rose-200">Unable to load users (${err.message}). Verify Firebase security rules allow admin to read /users.</div>`;
			}
		}
	);
}

function renderUsersTable(usersData) {
	const tbody = document.getElementById('users-table-body');
	if (!tbody) return;

	const uids = Object.keys(usersData);
	if (uids.length === 0) {
		tbody.innerHTML =
			'<div class="py-4 text-center text-xs text-slate-400 italic">No registered users found.</div>';
		return;
	}

	let html = '';
	uids.forEach((uid) => {
		const user = usersData[uid] || {};
		const isSelf = currentUser && uid === currentUser.uid;
		const displayName = escapeHtml(user.displayName || 'No display name');
		const email = escapeHtml(user.email || 'No email');
		const role = user.role || 'VIEWER';
		const birthday = user.birthday || '';
		const hasMedsAlert = !!user.notifyOnMeds;
		const isActive = user.active !== false; // default true if undefined

		html += `
			<div class="p-3.5 rounded-xl border ${
				!isActive
					? 'border-rose-200 bg-rose-50/50 opacity-75'
					: 'border-slate-200 bg-slate-50'
			} flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition">
				<div class="min-w-0 space-y-0.5">
					<div class="font-bold text-slate-900 text-sm flex items-center gap-1.5 flex-wrap">
						<span>${displayName}</span>
						${
							isSelf
								? '<span class="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-bold">YOU</span>'
								: ''
						}
						${
							!isActive
								? '<span class="text-[10px] bg-rose-100 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded font-bold uppercase">Deactivated</span>'
								: ''
						}
					</div>
					<div class="text-xs text-slate-500 font-mono truncate">${email}</div>
					<div class="text-[10px] text-slate-400 font-mono select-all truncate">UID: ${uid}</div>
				</div>

				<div class="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/70">
					<div class="flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1" title="User Birthday">
						<input
							type="date"
							value="${escapeHtml(birthday)}"
							onchange="updateUserBirthday('${uid}', this.value)"
							${!isActive ? 'disabled' : ''}
							class="text-xs text-slate-800 outline-none bg-transparent font-medium ${
								!isActive ? 'opacity-50 cursor-not-allowed' : ''
							}"
						/>
					</div>
					${
						hasMedsAlert
							? '<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">Alerts On</span>'
							: '<span class="text-slate-400 text-[11px] px-1.5">Alerts Off</span>'
					}
					<select
						onchange="updateUserRole('${uid}', this.value)"
						${!isActive ? 'disabled' : ''}
						class="bg-white border border-slate-300 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 font-semibold ${
							!isActive ? 'opacity-50 cursor-not-allowed' : ''
						}"
					>
						<option value="ADMIN" ${role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
						<option value="EDITOR" ${role === 'EDITOR' ? 'selected' : ''}>EDITOR</option>
						<option value="VIEWER" ${role === 'VIEWER' ? 'selected' : ''}>VIEWER</option>
					</select>

					${
						isSelf
							? '<span class="text-emerald-700 text-xs font-semibold px-2.5 py-1 bg-emerald-50 rounded-lg border border-emerald-200">Active</span>'
							: `
							<div class="flex items-center gap-1.5 ml-auto sm:ml-0">
								<button
									type="button"
									onclick="toggleUserActive('${uid}', ${!isActive}, '${displayName || email}')"
									class="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
										isActive
											? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200'
											: 'bg-white text-slate-600 border border-slate-300 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
									}"
									title="${isActive ? 'Click to deactivate user' : 'Click to activate user'}"
								>
									<span>${isActive ? 'Active' : 'Inactive'}</span>
								</button>
								<button
									type="button"
									onclick="deleteUserProfile('${uid}', '${displayName || email}')"
									class="text-slate-400 hover:text-rose-600 text-xs font-semibold px-2 py-1.5 rounded-lg hover:bg-rose-50 transition"
									title="Permanently remove database record"
								>
									Delete
								</button>
							</div>
						`
					}
				</div>
			</div>
		`;
	});

	tbody.innerHTML = html;
}

async function updateUserBirthday(uid, newBirthday) {
	if (!currentUser) return;
	try {
		await database.ref(`users/${uid}/birthday`).set(newBirthday || '');
		if (currentUser && uid === currentUser.uid) {
			const profileBirthday = document.getElementById('input-profile-birthday');
			if (profileBirthday) profileBirthday.value = newBirthday || '';
		}
		showToast('User birthday updated.');
	} catch (err) {
		console.error('Failed to update user birthday:', err);
		alert('Failed to update user birthday: ' + err.message);
	}
}

async function toggleUserActive(uid, newActiveState, label) {
	if (!currentUser) return;
	if (uid === currentUser.uid && !newActiveState) {
		alert('You cannot deactivate your own administrative account.');
		return;
	}

	const confirmMsg = newActiveState
		? `Activate the account for "${label}"? They will regain access to the board.`
		: `Deactivate the account for "${label}"?\n\nThey will be immediately signed out and blocked from logging in until reactivated.`;

	const proceed = confirm(confirmMsg);
	if (!proceed) return;

	try {
		await database.ref(`users/${uid}/active`).set(newActiveState);
		showToast(`User "${label}" is now ${newActiveState ? 'ACTIVE' : 'DEACTIVATED'}.`);
	} catch (err) {
		console.error('Failed to update active state:', err);
		alert('Failed to update account status: ' + err.message);
	}
}

async function updateUserRole(uid, newRole) {
	if (!currentUser) return;
	if (uid === currentUser.uid && newRole !== 'ADMIN') {
		const proceed = confirm(
			'WARNING: You are changing your own role away from ADMIN. You will lose access to administrative settings immediately. Are you sure you want to proceed?'
		);
		if (!proceed) {
			initUsersManagement();
			return;
		}
	}

	try {
		await database.ref(`users/${uid}/role`).set(newRole);
		showToast(`Role updated to ${newRole} for user.`);
		if (uid === currentUser.uid && newRole !== 'ADMIN') {
			setTimeout(() => location.reload(), 1000);
		}
	} catch (err) {
		console.error('Failed to update role:', err);
		alert('Failed to update user role: ' + err.message);
	}
}

async function deleteUserProfile(uid, label) {
	const proceed = confirm(
		`Are you sure you want to remove the database profile for "${label}"?\n\nTip: You can deactivate the user instead of deleting to safely disable their access while keeping their history.\n\nProceed with permanent removal from database?`
	);
	if (!proceed) return;

	try {
		await database.ref(`users/${uid}`).remove();
		await database.ref(`board/userContacts/${uid}`).remove();
		showToast(`User profile removed for ${label}.`);
	} catch (err) {
		console.error('Failed to delete user profile:', err);
		alert('Failed to remove user: ' + err.message);
	}
}

function toggleAddUserForm(show) {
	const form = document.getElementById('form-add-user');
	if (!form) return;
	if (typeof show === 'boolean') {
		if (show) form.classList.remove('hidden');
		else form.classList.add('hidden');
	} else {
		form.classList.toggle('hidden');
	}
}

async function savePreconfiguredUser() {
	const uid = document.getElementById('input-new-uid').value.trim();
	const email = document.getElementById('input-new-email').value.trim();
	const birthday = document.getElementById('input-new-birthday')?.value || '';
	const role = document.getElementById('select-new-role').value;

	if (!uid) {
		alert('Please enter the user UID copied from the Firebase Authentication Console.');
		return;
	}

	try {
		await database.ref(`users/${uid}`).set({
			email: email,
			displayName: email ? email.split('@')[0] : 'User',
			birthday: birthday,
			role: role,
			active: true,
			notifyOnMeds: false,
			createdAt: Date.now(),
		});
		document.getElementById('input-new-uid').value = '';
		document.getElementById('input-new-email').value = '';
		if (document.getElementById('input-new-birthday')) {
			document.getElementById('input-new-birthday').value = '';
		}
		toggleAddUserForm(false);
		showToast(`User pre-configured successfully with role ${role}.`);
	} catch (err) {
		console.error('Failed to pre-configure user:', err);
		alert('Error saving user: ' + err.message);
	}
}

// Contacts & Birthdays Functions (Active Users + Additional Non-User Contacts)
let editingContactId = null;

function isBirthdayToday(birthdayStr) {
	if (!birthdayStr) return false;
	const parts = String(birthdayStr).split('-');
	if (parts.length < 2) return false;
	const mmdd = parts.slice(-2).join('-');
	const todayMmdd = getTodayDateString().slice(5);
	return mmdd === todayMmdd;
}

function formatBirthdayDisplay(birthdayStr) {
	if (!birthdayStr) return '';
	const parts = String(birthdayStr).split('-').map(Number);
	if (parts.length < 2) return '';
	const month = parts.length === 3 ? parts[1] : parts[0];
	const day = parts.length === 3 ? parts[2] : parts[1];
	if (!month || !day) return '';
	const d = new Date(2000, month - 1, day);
	return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getCombinedContactsList() {
	// Merge active users from board/userContacts and liveUsersData
	const mergedUsersMap = { ...(currentBoardUserContacts || {}) };
	Object.entries(liveUsersData || {}).forEach(([uid, u]) => {
		if (!u || u.active === false) {
			delete mergedUsersMap[uid];
		} else {
			mergedUsersMap[uid] = normalizeUserContact(u);
		}
	});

	const activeUsersList = Object.entries(mergedUsersMap)
		.filter(([, u]) => u && u.active !== false)
		.map(([uid, u]) => normalizeContactRecord(u, uid, true))
		.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

	const additionalContactsList = Object.entries(currentAdditionalContacts || {})
		.map(([id, c]) => normalizeContactRecord(c, id, false))
		.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

	return {
		activeUsersList,
		additionalContactsList,
		allContacts: [...activeUsersList, ...additionalContactsList],
	};
}

function renderContacts() {
	const dispContainer = document.getElementById('disp-contacts-list');
	const adminContainer = document.getElementById('admin-contacts-list');
	const countBadge = document.getElementById('contacts-count-badge');

	const { allContacts } = getCombinedContactsList();

	updateEntryCountBadge(countBadge, allContacts.length);

	// 1. Render Display View Contacts Card
	if (dispContainer) {
		if (allContacts.length === 0) {
			dispContainer.innerHTML = `
				<div class="w-full p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center space-y-1">
					<div class="text-xl sm:text-2xl font-black text-slate-800">No contacts listed</div>
					<div class="text-sm sm:text-base font-semibold text-slate-500">Add family or contacts in the panel.</div>
				</div>
			`;
		} else {
			let html = '';
			allContacts.forEach((c) => {
				const bdayText = formatBirthdayDisplay(c.birthday);
				const bdayToday = isBirthdayToday(c.birthday);
				html += `
					<div class="p-5 bg-slate-50/90 rounded-2xl border ${
						bdayToday ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'
					} space-y-2">
						<div class="flex items-center justify-between gap-3 flex-wrap">
							<div class="font-black text-slate-950 text-2xl sm:text-3xl flex items-center gap-3 flex-wrap">
								<span>${escapeHtml(c.name)}</span>
								${
									c.relation
										? `<span class="text-base sm:text-lg font-bold px-3.5 py-1 rounded-xl ${
												c.isUser
													? 'bg-blue-100 text-blue-900 border border-blue-300'
													: 'bg-white text-slate-700 border border-slate-300'
										  }">${escapeHtml(c.relation)}</span>`
										: ''
								}
							</div>
							${
								bdayText
									? `<span class="text-base sm:text-lg font-bold px-3.5 py-1 rounded-xl border flex items-center gap-2 ${
											bdayToday
												? 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold'
												: 'bg-white text-slate-700 border-slate-200'
									  }">${bdayText}${bdayToday ? ' (TODAY!)' : ''}</span>`
									: ''
							}
						</div>
						${
							c.phone
								? `<div class="text-xl sm:text-2xl text-slate-800 font-bold pt-1">
										<span class="text-slate-500 font-medium">Phone:</span> ${escapeHtml(c.phone)}
								   </div>`
								: ''
						}
					</div>
				`;
			});
			dispContainer.innerHTML = html;
		}
	}

	// 2. Render Admin / Editor Contacts Directory List
	if (adminContainer) {
		if (allContacts.length === 0) {
			adminContainer.innerHTML = `
				<div class="p-3 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-slate-200">
					No contacts found.
				</div>
			`;
		} else {
			let adminHtml = '';
			allContacts.forEach((c) => {
				const bdayText = formatBirthdayDisplay(c.birthday);
				const isEditingThis = !c.isUser && editingContactId === c.id;
				adminHtml += `
					<div class="p-3 rounded-xl border ${
						isEditingThis
							? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-300'
							: 'bg-slate-50 border-slate-200'
					} flex items-center justify-between gap-3 transition">
						<div class="space-y-0.5 min-w-0">
							<div class="flex items-center gap-1.5 flex-wrap">
								<span class="font-bold text-slate-800 text-sm">${escapeHtml(c.name)}</span>
								${
									c.isUser
										? '<span class="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">Active User</span>'
										: ''
								}
								${
									c.relation
										? `<span class="text-[11px] font-semibold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">${escapeHtml(
												c.relation
										  )}</span>`
										: ''
								}
								${
									bdayText
										? `<span class="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">${bdayText}</span>`
										: ''
								}
								${
									isEditingThis
										? '<span class="text-[10px] font-bold uppercase tracking-wider bg-blue-600 text-white px-1.5 py-0.5 rounded">Editing</span>'
										: ''
								}
							</div>
							<div class="text-xs text-slate-500 truncate">
								${[c.phone ? `Phone: ${escapeHtml(c.phone)}` : '', c.email ? `Email: ${escapeHtml(c.email)}` : '']
									.filter(Boolean)
									.join(' • ') || 'No phone or email listed'}
							</div>
						</div>
						${
							c.isUser
								? '<span class="text-[11px] text-slate-400 italic shrink-0">Edit in Profile</span>'
								: `
								<div class="flex items-center gap-1 shrink-0">
									<button
										type="button"
										onclick="startEditContact('${c.id}')"
										class="text-blue-600 hover:text-blue-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition"
									>
										Edit
									</button>
									<button
										type="button"
										onclick="deleteAdditionalContact('${c.id}')"
										class="text-rose-600 hover:text-rose-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition"
									>
										Delete
									</button>
								</div>
							`
						}
					</div>
				`;
			});
			adminContainer.innerHTML = adminHtml;
		}
	}
}

function startEditContact(contactId) {
	const c = currentAdditionalContacts[contactId];
	if (!c) return;

	editingContactId = contactId;

	const nameInput = document.getElementById('input-contact-name');
	const relationInput = document.getElementById('input-contact-relation');
	const phoneInput = document.getElementById('input-contact-phone');
	const bdayInput = document.getElementById('input-contact-birthday');

	if (nameInput) nameInput.value = c.name || '';
	if (relationInput) relationInput.value = c.relation || '';
	if (phoneInput) phoneInput.value = c.phone || '';
	if (bdayInput) bdayInput.value = c.birthday || '';

	const formContainer = document.getElementById('contact-form-container');
	const formHeading = document.getElementById('contact-form-heading');
	const editingBadge = document.getElementById('contact-editing-badge');
	const cancelBtn = document.getElementById('btn-cancel-edit-contact');
	const submitBtnText = document.getElementById('btn-submit-contact-text');

	if (formContainer) {
		formContainer.className =
			'p-3.5 sm:p-4 bg-blue-50/40 rounded-xl border-2 border-blue-400 space-y-3 transition-colors';
		formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}
	if (formHeading) {
		formHeading.innerText = 'Edit Contact';
		formHeading.className = 'text-xs font-bold text-blue-700 uppercase tracking-wider';
	}
	if (editingBadge) editingBadge.classList.remove('hidden');
	if (cancelBtn) cancelBtn.classList.remove('hidden');
	if (submitBtnText) submitBtnText.innerText = 'Save Contact Changes';

	renderContacts();
	if (nameInput) nameInput.focus();
}

function cancelEditContact() {
	editingContactId = null;

	const nameInput = document.getElementById('input-contact-name');
	const relationInput = document.getElementById('input-contact-relation');
	const phoneInput = document.getElementById('input-contact-phone');
	const bdayInput = document.getElementById('input-contact-birthday');

	if (nameInput) nameInput.value = '';
	if (relationInput) relationInput.value = '';
	if (phoneInput) phoneInput.value = '';
	if (bdayInput) bdayInput.value = '';

	const formContainer = document.getElementById('contact-form-container');
	const formHeading = document.getElementById('contact-form-heading');
	const editingBadge = document.getElementById('contact-editing-badge');
	const cancelBtn = document.getElementById('btn-cancel-edit-contact');
	const submitBtnText = document.getElementById('btn-submit-contact-text');

	if (formContainer) {
		formContainer.className =
			'p-3.5 sm:p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 transition-colors';
	}
	if (formHeading) {
		formHeading.innerText = 'Add Additional Contact';
		formHeading.className = 'text-xs font-bold text-slate-700 uppercase tracking-wider';
	}
	if (editingBadge) editingBadge.classList.add('hidden');
	if (cancelBtn) cancelBtn.classList.add('hidden');
	if (submitBtnText) submitBtnText.innerText = '+ Add Contact';

	renderContacts();
}

async function saveAdditionalContact() {
	if (!userProfile || (userProfile.role !== 'ADMIN' && userProfile.role !== 'EDITOR')) {
		alert('Permission Denied: Only ADMIN and EDITOR users can modify contacts.');
		return;
	}

	const nameInput = document.getElementById('input-contact-name');
	const relationInput = document.getElementById('input-contact-relation');
	const phoneInput = document.getElementById('input-contact-phone');
	const bdayInput = document.getElementById('input-contact-birthday');

	const name = (nameInput?.value || '').trim();
	const relation = (relationInput?.value || '').trim();
	const phone = (phoneInput?.value || '').trim();
	const birthday = bdayInput?.value || '';

	if (!name) {
		alert('Please enter a contact name.');
		if (nameInput) nameInput.focus();
		return;
	}

	if (editingContactId) {
		const targetId = editingContactId;
		try {
			await database.ref(`board/contacts/${targetId}`).update({
				name,
				relation,
				phone,
				birthday,
				updatedAt: Date.now(),
			});
			cancelEditContact();
			showToast(`Contact "${name}" updated!`);
		} catch (err) {
			console.error('Failed to update contact:', err);
			alert('Error updating contact: ' + err.message);
		}
		return;
	}

	const contactId = 'cnt_' + Date.now();
	try {
		await database.ref(`board/contacts/${contactId}`).set({
			name,
			relation,
			phone,
			birthday,
			createdAt: Date.now(),
		});
		cancelEditContact();
		showToast(`Contact "${name}" added!`);
	} catch (err) {
		console.error('Failed to add contact:', err);
		alert('Error adding contact: ' + err.message);
	}
}

async function deleteAdditionalContact(contactId) {
	const c = currentAdditionalContacts[contactId];
	const name = c ? c.name : 'this contact';
	const proceed = confirm(`Remove "${name}" from the contacts list?`);
	if (!proceed) return;

	try {
		if (editingContactId === contactId) {
			cancelEditContact();
		}
		await database.ref(`board/contacts/${contactId}`).remove();
		showToast(`Contact "${name}" removed.`);
	} catch (err) {
		console.error('Failed to remove contact:', err);
		alert('Error removing contact: ' + err.message);
	}
}

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

// Calendar Events & Appointments Functions
function getTodayDateString() {
	const d = new Date();
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function formatEventDate(dateStr, timeStr, endDateStr) {
	if (!dateStr) return { badge: '', badgeColor: '', time: '', isMultiDay: false, rangeLabel: '' };
	const [year, month, day] = dateStr.split('-').map(Number);
	const eventDate = new Date(year, month - 1, day);

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);

	const eventTimeZero = new Date(eventDate);
	eventTimeZero.setHours(0, 0, 0, 0);

	const isMultiDay = !!(endDateStr && endDateStr > dateStr);
	let endDate = null;
	let endTimeZero = null;
	let rangeLabel = '';

	if (isMultiDay) {
		const [ey, em, ed] = endDateStr.split('-').map(Number);
		endDate = new Date(ey, em - 1, ed);
		endTimeZero = new Date(endDate);
		endTimeZero.setHours(0, 0, 0, 0);
		const startShort = eventDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
		const endShort = endDate.toLocaleDateString([], {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
		});
		rangeLabel = `${startShort} – ${endShort}`;
	}

	let badge = '';
	let badgeColor = '';

	if (isMultiDay) {
		const endShort = endDate.toLocaleDateString([], {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
		});
		if (eventTimeZero.getTime() <= today.getTime() && endTimeZero.getTime() >= today.getTime()) {
			badge = `TODAY • Thru ${endShort}`;
			badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
		} else if (eventTimeZero.getTime() === tomorrow.getTime()) {
			badge = `TOMORROW • Thru ${endShort}`;
			badgeColor = 'bg-blue-100 text-blue-800 border-blue-300';
		} else {
			const startWithDay = eventDate.toLocaleDateString([], {
				weekday: 'short',
				month: 'short',
				day: 'numeric',
			});
			badge = `${startWithDay} – ${endShort}`;
			badgeColor = 'bg-white text-slate-700 border-slate-300';
		}
	} else if (eventTimeZero.getTime() === today.getTime()) {
		badge = 'TODAY';
		badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
	} else if (eventTimeZero.getTime() === tomorrow.getTime()) {
		badge = 'TOMORROW';
		badgeColor = 'bg-blue-100 text-blue-800 border-blue-300';
	} else {
		badge = eventDate.toLocaleDateString([], {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
		});
		badgeColor = 'bg-white text-slate-700 border-slate-300';
	}

	let formattedTime = '';
	if (timeStr) {
		const [h, m] = timeStr.split(':').map(Number);
		const d = new Date();
		d.setHours(h, m, 0, 0);
		formattedTime = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	}

	return { badge, badgeColor, time: formattedTime, isMultiDay, rangeLabel };
}

let editingEventId = null;
let currentEventsMap = {};
let upcomingHolidays = [];

function getNthWeekdayOfMonth(year, monthIndex, weekday, n) {
	const firstDay = new Date(year, monthIndex, 1);
	const firstWeekdayOffset = (weekday - firstDay.getDay() + 7) % 7;
	const day = 1 + firstWeekdayOffset + (n - 1) * 7;
	const m = String(monthIndex + 1).padStart(2, '0');
	const d = String(day).padStart(2, '0');
	return `${year}-${m}-${d}`;
}

function getLastWeekdayOfMonth(year, monthIndex, weekday) {
	const lastDay = new Date(year, monthIndex + 1, 0);
	const offset = (lastDay.getDay() - weekday + 7) % 7;
	const day = lastDay.getDate() - offset;
	const m = String(monthIndex + 1).padStart(2, '0');
	const d = String(day).padStart(2, '0');
	return `${year}-${m}-${d}`;
}

function getBuiltInMajorUSHolidays(year) {
	return [
		{ date: `${year}-01-01`, name: "New Year's Day" },
		{ date: getNthWeekdayOfMonth(year, 0, 1, 3), name: 'Martin Luther King, Jr. Day' },
		{ date: `${year}-02-14`, name: "Valentine's Day" },
		{ date: getNthWeekdayOfMonth(year, 1, 1, 3), name: "Presidents' Day" },
		{ date: `${year}-03-17`, name: "St. Patrick's Day" },
		{ date: getNthWeekdayOfMonth(year, 4, 0, 2), name: "Mother's Day" },
		{ date: getLastWeekdayOfMonth(year, 4, 1), name: 'Memorial Day' },
		{ date: `${year}-06-19`, name: 'Juneteenth' },
		{ date: getNthWeekdayOfMonth(year, 5, 0, 3), name: "Father's Day" },
		{ date: `${year}-07-04`, name: 'Independence Day' },
		{ date: getNthWeekdayOfMonth(year, 8, 1, 1), name: 'Labor Day' },
		{ date: `${year}-10-31`, name: 'Halloween' },
		{ date: `${year}-11-11`, name: 'Veterans Day' },
		{ date: getNthWeekdayOfMonth(year, 10, 4, 4), name: 'Thanksgiving Day' },
		{ date: `${year}-12-24`, name: 'Christmas Eve' },
		{ date: `${year}-12-25`, name: 'Christmas Day' },
		{ date: `${year}-12-31`, name: "New Year's Eve" },
	];
}

function getHolidayEmoji(name) {
	return '';
}

async function fetchUpcomingUSHolidays() {
	const todayStr = getTodayDateString();
	const currentYear = new Date().getFullYear();
	let combined = [
		...getBuiltInMajorUSHolidays(currentYear),
		...getBuiltInMajorUSHolidays(currentYear + 1),
	];

	try {
		const res = await fetch('https://date.nager.at/api/v3/NextPublicHolidays/US');
		if (res.ok) {
			const apiHolidays = await res.json();
			if (Array.isArray(apiHolidays)) {
				apiHolidays.forEach((item) => {
					if (item && item.date && (item.localName || item.name)) {
						combined.push({
							date: item.date,
							name: item.localName || item.name,
						});
					}
				});
			}
		}
	} catch (err) {
		console.warn('Using built-in US holidays schedule (API unreachable):', err);
	}

	// Deduplicate by date (preferring first entry per date) and filter for today or later
	const byDate = new Map();
	combined.forEach((h) => {
		if (h.date && h.date >= todayStr && !byDate.has(h.date)) {
			byDate.set(h.date, h);
		}
	});

	upcomingHolidays = Array.from(byDate.values()).sort((a, b) =>
		a.date.localeCompare(b.date)
	);

	renderEvents(latestBoardData?.events || currentEventsMap || {});
}

function formatHolidayCountdown(dateStr) {
	const [year, month, day] = dateStr.split('-').map(Number);
	const target = new Date(year, month - 1, day);
	target.setHours(0, 0, 0, 0);

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
	const formattedDate = target.toLocaleDateString([], {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	});

	if (diffDays === 0) {
		return {
			formattedDate,
			countdown: 'TODAY',
			badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
		};
	}
	if (diffDays === 1) {
		return {
			formattedDate,
			countdown: 'TOMORROW',
			badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
		};
	}
	return {
		formattedDate,
		countdown: `In ${diffDays} days`,
		badgeClass: 'bg-white text-slate-600 border-slate-300',
	};
}

function renderTodayColumn() {
	const todayList = document.getElementById('disp-today-events-list');
	const todayCountBadge = document.getElementById('today-events-count-badge');
	if (!todayList) return;

	const todayStr = getTodayDateString();
	const todaysHolidays = upcomingHolidays.filter((h) => h.date === todayStr);
	const { allContacts } = getCombinedContactsList();
	const todaysBirthdays = allContacts.filter((c) => isBirthdayToday(c.birthday));

	const entries = Object.entries(currentEventsMap || {});
	const todayEvents = entries
		.map(([id, evt]) => ({ id, ...evt }))
		.filter((evt) => isEventOnToday(evt, todayStr))
		.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

	const todayTotal = todaysHolidays.length + todaysBirthdays.length + todayEvents.length;
	updateEntryCountBadge(todayCountBadge, todayTotal);

	if (todayTotal === 0) {
		todayList.innerHTML = `
			<div class="w-full p-3.5 bg-white/80 rounded-xl border border-dashed border-blue-200 text-center space-y-0.5">
				<div class="text-sm sm:text-base font-bold text-slate-700">No events scheduled for today</div>
				<div class="text-xs text-slate-500">Enjoy a relaxing day!</div>
			</div>
		`;
		return;
	}

	let todayHtml = '';

	// 1. Render any US Holiday falling on today
	todaysHolidays.forEach((h) => {
		todayHtml += `
			<div class="w-full bg-amber-50 p-4 rounded-2xl border-2 border-amber-300 shadow-sm flex items-center gap-3.5">
				<div>
					<div class="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-900">
						Holiday Today
					</div>
					<div class="text-xl sm:text-2xl font-black text-slate-900">
						${escapeHtml(h.name)}
					</div>
				</div>
			</div>
		`;
	});

	// 2. Render any User or Contact Birthday falling on today
	todaysBirthdays.forEach((c) => {
		todayHtml += `
			<div class="w-full bg-amber-50 p-4 rounded-2xl border-2 border-amber-300 shadow-sm flex items-center gap-3.5">
				<div>
					<div class="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-900">
						Birthday Today!
					</div>
					<div class="text-xl sm:text-2xl font-black text-slate-900">
						Happy Birthday, ${escapeHtml(c.name)}!
					</div>
					${
						c.relation
							? `<div class="text-sm sm:text-base font-bold text-amber-900/90">${escapeHtml(c.relation)}</div>`
							: ''
					}
				</div>
			</div>
		`;
	});

	// 3. Render any Scheduled Appointments / Multi-Day Events falling on today
	todayEvents.forEach((evt) => {
		const { time, isMultiDay, rangeLabel } = formatEventDate(evt.date, evt.time, evt.endDate);
		todayHtml += `
			<div class="w-full bg-white p-4 rounded-2xl border-2 border-amber-300 shadow-sm space-y-1.5">
				<div class="flex items-center gap-2 flex-wrap">
					<span class="text-xs sm:text-sm font-black uppercase tracking-wider px-3 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
						TODAY
					</span>
					${
						isMultiDay && rangeLabel
							? `<span class="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">${escapeHtml(
									rangeLabel
							  )}</span>`
							: ''
					}
					${
						time
							? `<span class="text-xs sm:text-sm font-bold text-blue-800 bg-blue-50 border border-blue-200 px-3 py-1 rounded-md flex items-center gap-1.5">${time}</span>`
							: ''
					}
				</div>
				<div class="text-xl sm:text-2xl font-black text-slate-900 pt-0.5 leading-snug">
					${escapeHtml(evt.title)}
				</div>
				${
					evt.notes
						? `<div class="text-base sm:text-lg text-slate-700 font-semibold flex items-center gap-2">${escapeHtml(
								evt.notes
						  )}</div>`
						: ''
				}
				${
					evt.reminder
						? `<div class="text-base sm:text-lg text-indigo-800 font-bold flex items-center gap-2 pt-0.5">${escapeHtml(
								evt.reminder
						  )}</div>`
						: ''
				}
			</div>
		`;
	});

	todayList.innerHTML = todayHtml;
}

function renderEvents(eventsObj) {
	currentEventsMap = eventsObj || {};
	const dispContainer = document.getElementById('disp-events-list');
	const adminContainer = document.getElementById('admin-events-list');
	const countBadge = document.getElementById('events-count-badge');
	const todayStr = getTodayDateString();

	const entries = Object.entries(currentEventsMap);

	// Automatic past-event cleanup for Admin & Editor (only after effective end date has passed)
	if (userProfile && (userProfile.role === 'ADMIN' || userProfile.role === 'EDITOR')) {
		entries.forEach(([id, evt]) => {
			const effectiveEnd = getEventEffectiveEndDate(evt);
			if (effectiveEnd && effectiveEnd < todayStr) {
				console.log('Auto-removing past calendar event:', id, evt.title);
				database.ref(`board/events/${id}`).remove();
			}
		});
	}

	// Filter for upcoming or currently active multi-day events (endDate >= today)
	const upcoming = entries
		.map(([id, evt]) => ({ id, ...evt }))
		.filter((evt) => isEventUpcomingOrActive(evt, todayStr));

	// Sort chronologically: active/earliest start date first, then by time
	upcoming.sort((a, b) => {
		const aActive = isEventOnToday(a, todayStr) ? 0 : 1;
		const bActive = isEventOnToday(b, todayStr) ? 0 : 1;
		if (aActive !== bActive) return aActive - bActive;
		const dateCmp = (a.date || '').localeCompare(b.date || '');
		if (dateCmp !== 0) return dateCmp;
		return (a.time || '').localeCompare(b.time || '');
	});

	// Merge next 4 upcoming major US holidays chronologically with upcoming appointments
	const mergedHolidays = upcomingHolidays.slice(0, 4).map((h) => ({
		itemType: 'holiday',
		sortDate: h.date,
		sortActive: h.date === todayStr ? 0 : 1,
		sortTime: '00:00',
		holiday: h,
	}));

	const mergedEvents = upcoming.map((evt) => ({
		itemType: 'event',
		sortDate: isEventOnToday(evt, todayStr) ? todayStr : evt.date || '',
		sortActive: isEventOnToday(evt, todayStr) ? 0 : 1,
		sortTime: evt.time || '23:59',
		evt,
	}));

	const combinedDisplayItems = [...mergedEvents, ...mergedHolidays].sort((a, b) => {
		if (a.sortActive !== b.sortActive) return a.sortActive - b.sortActive;
		const dCmp = (a.sortDate || '').localeCompare(b.sortDate || '');
		if (dCmp !== 0) return dCmp;
		if (a.itemType !== b.itemType) return a.itemType === 'event' ? -1 : 1;
		return (a.sortTime || '').localeCompare(b.sortTime || '');
	});

	// Update header entry count badge (total items in scrollable card)
	updateEntryCountBadge(countBadge, combinedDisplayItems.length);

	// 0. Automatically Render Today's Holidays & Scheduled Events inside Main Message Section Column 2
	renderTodayColumn();
	renderAiSummaryCard();

	// 1. Render Display View Scheduled Events & Upcoming Holidays Card
	if (dispContainer) {
		if (combinedDisplayItems.length === 0) {
			dispContainer.innerHTML = `
				<div class="w-full p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center space-y-1">
					<div class="text-base font-bold text-slate-700">No appointments scheduled</div>
					<div class="text-xs text-slate-500">Relax and enjoy your day!</div>
				</div>
			`;
		} else {
			let html = '';
			combinedDisplayItems.forEach((item) => {
				if (item.itemType === 'holiday') {
					const h = item.holiday;
					const { formattedDate, countdown, badgeClass } = formatHolidayCountdown(h.date);
					html += `
						<div class="w-full bg-amber-50/50 p-4 sm:p-5 rounded-2xl border border-amber-200 flex items-center justify-between gap-3">
							<div class="flex items-center gap-3 min-w-0">
								<div class="min-w-0">
									<div class="flex items-center gap-1.5 flex-wrap">
										<span class="text-xs sm:text-sm font-black uppercase tracking-wider px-2.5 py-1 rounded bg-amber-100 text-amber-900 border border-amber-300">
											US Holiday
										</span>
										<span class="text-sm sm:text-base font-bold text-slate-700">${formattedDate}</span>
									</div>
									<div class="text-xl sm:text-2xl font-black text-slate-900 truncate pt-1">
										${escapeHtml(h.name)}
									</div>
								</div>
							</div>
							<span class="text-sm sm:text-base font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border shrink-0 ${badgeClass}">
								${countdown}
							</span>
						</div>
					`;
				} else {
					const evt = item.evt;
					const { badge, badgeColor, time } = formatEventDate(evt.date, evt.time, evt.endDate);
					html += `
						<div class="w-full bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 flex flex-col justify-between gap-2.5">
							<div class="space-y-1">
								<div class="flex items-center gap-2 flex-wrap">
									<span class="text-xs sm:text-sm font-black uppercase tracking-wider px-3 py-1 rounded-md border ${badgeColor}">
										${badge}
									</span>
									${
										time
											? `<span class="text-xs sm:text-sm font-bold text-blue-800 bg-blue-50 border border-blue-200 px-3 py-1 rounded-md flex items-center gap-1.5">${time}</span>`
											: ''
									}
								</div>
								<div class="text-2xl sm:text-3xl font-black text-slate-900 pt-1 leading-snug">
									${escapeHtml(evt.title)}
								</div>
								${
									evt.notes
										? `<div class="text-base sm:text-lg text-slate-700 font-semibold flex items-center gap-2 pt-0.5">${escapeHtml(
												evt.notes
										  )}</div>`
										: ''
								}
								${
									evt.reminder
										? `<div class="text-xs sm:text-sm text-indigo-700 font-semibold flex items-center gap-1.5 pt-0.5">${escapeHtml(
												evt.reminder
										  )}</div>`
										: ''
								}
							</div>
						</div>
					`;
				}
			});
			dispContainer.innerHTML = html;
		}
	}

	// 2. Render Admin / Editor Panel Management List
	if (adminContainer) {
		if (upcoming.length === 0) {
			adminContainer.innerHTML = `
				<div class="p-3 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-slate-200">
					No upcoming appointments.
				</div>
			`;
		} else {
			let adminHtml = '';
			upcoming.forEach((evt) => {
				const { badge, time } = formatEventDate(evt.date, evt.time, evt.endDate);
				const isEditingThis = editingEventId === evt.id;
				adminHtml += `
					<div class="p-3 rounded-xl border ${
						isEditingThis
							? 'bg-blue-50/70 border-blue-300 ring-1 ring-blue-300'
							: 'bg-slate-50 border-slate-200'
					} flex items-center justify-between gap-3 transition">
						<div class="space-y-0.5 min-w-0">
							<div class="flex items-center gap-2 flex-wrap">
								<span class="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">${badge} ${
					time ? '• ' + time : ''
				} • ${(() => {
					const c = getEventContext(evt);
					const map = { medical: 'Medical', family: 'Visit', errand: 'Errand', service: 'Service', other: 'Other' };
					return map[c.category] || 'Event';
				})()}</span>
								<span class="font-bold text-slate-800 text-sm truncate">${escapeHtml(evt.title)}</span>
								${
									isEditingThis
										? '<span class="text-[10px] font-bold uppercase tracking-wider bg-blue-600 text-white px-1.5 py-0.5 rounded">Editing</span>'
										: ''
								}
							</div>
							${
								evt.notes
									? `<div class="text-xs text-slate-500 truncate pl-0.5">Note: ${escapeHtml(evt.notes)}</div>`
									: ''
							}
							${
								evt.reminder
									? `<div class="text-xs text-indigo-600 font-medium truncate pl-0.5">Reminder: ${escapeHtml(evt.reminder)}</div>`
									: ''
							}
						</div>
						<div class="flex items-center gap-1 shrink-0">
							<button
								type="button"
								onclick="startEditCalendarEvent('${evt.id}')"
								class="text-blue-600 hover:text-blue-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition"
							>
								Edit
							</button>
							<button
								type="button"
								onclick="deleteCalendarEvent('${evt.id}')"
								class="text-rose-600 hover:text-rose-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition"
							>
								Delete
							</button>
						</div>
					</div>
				`;
			});
			adminContainer.innerHTML = adminHtml;
		}
	}
}

function startEditCalendarEvent(eventId) {
	const evt = currentEventsMap[eventId];
	if (!evt) return;

	editingEventId = eventId;

	const titleInput = document.getElementById('input-event-title');
	const categoryInput = document.getElementById('input-event-category');
	const locationInput = document.getElementById('input-event-location');
	const dateInput = document.getElementById('input-event-date');
	const endDateInput = document.getElementById('input-event-end-date');
	const timeInput = document.getElementById('input-event-time');
	const notesInput = document.getElementById('input-event-notes');
	const reminderInput = document.getElementById('input-event-reminder');

	const ctx = getEventContext(evt);
	if (titleInput) titleInput.value = evt.title || '';
	if (categoryInput) categoryInput.value = evt.category || ctx.category || 'medical';
	if (locationInput) locationInput.value = evt.location || ctx.location || 'outing';
	if (dateInput) dateInput.value = evt.date || '';
	if (endDateInput) endDateInput.value = evt.endDate || '';
	if (timeInput) timeInput.value = evt.time || '';
	if (notesInput) notesInput.value = evt.notes || '';
	if (reminderInput) reminderInput.value = evt.reminder || '';

	const formContainer = document.getElementById('event-form-container');
	const formHeading = document.getElementById('event-form-heading');
	const editingBadge = document.getElementById('event-editing-badge');
	const cancelBtn = document.getElementById('btn-cancel-edit-event');
	const submitBtnText = document.getElementById('btn-submit-event-text');

	if (formContainer) {
		formContainer.className =
			'p-3.5 sm:p-4 bg-blue-50/40 rounded-xl border-2 border-blue-400 space-y-3 transition-colors';
		formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}
	if (formHeading) {
		formHeading.innerText = 'Edit Scheduled Event';
		formHeading.className = 'text-xs font-bold text-blue-700 uppercase tracking-wider';
	}
	if (editingBadge) editingBadge.classList.remove('hidden');
	if (cancelBtn) cancelBtn.classList.remove('hidden');
	if (submitBtnText) submitBtnText.innerText = 'Save Event Changes';

	renderEvents(currentEventsMap);
	if (titleInput) titleInput.focus();
}

function cancelEditCalendarEvent() {
	editingEventId = null;

	const titleInput = document.getElementById('input-event-title');
	const categoryInput = document.getElementById('input-event-category');
	const locationInput = document.getElementById('input-event-location');
	const dateInput = document.getElementById('input-event-date');
	const endDateInput = document.getElementById('input-event-end-date');
	const timeInput = document.getElementById('input-event-time');
	const notesInput = document.getElementById('input-event-notes');
	const reminderInput = document.getElementById('input-event-reminder');

	if (titleInput) titleInput.value = '';
	if (categoryInput) categoryInput.value = 'medical';
	if (locationInput) locationInput.value = 'outing';
	if (dateInput) dateInput.value = getTodayDateString();
	if (endDateInput) endDateInput.value = '';
	if (timeInput) timeInput.value = '';
	if (notesInput) notesInput.value = '';
	if (reminderInput) reminderInput.value = '';

	const formContainer = document.getElementById('event-form-container');
	const formHeading = document.getElementById('event-form-heading');
	const editingBadge = document.getElementById('event-editing-badge');
	const cancelBtn = document.getElementById('btn-cancel-edit-event');
	const submitBtnText = document.getElementById('btn-submit-event-text');

	if (formContainer) {
		formContainer.className =
			'p-3.5 sm:p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 transition-colors';
	}
	if (formHeading) {
		formHeading.innerText = 'Add New Event';
		formHeading.className = 'text-xs font-bold text-slate-700 uppercase tracking-wider';
	}
	if (editingBadge) editingBadge.classList.add('hidden');
	if (cancelBtn) cancelBtn.classList.add('hidden');
	if (submitBtnText) submitBtnText.innerText = '+ Add Event';

	renderEvents(currentEventsMap);
}

async function addCalendarEvent() {
	const titleInput = document.getElementById('input-event-title');
	const categoryInput = document.getElementById('input-event-category');
	const locationInput = document.getElementById('input-event-location');
	const dateInput = document.getElementById('input-event-date');
	const endDateInput = document.getElementById('input-event-end-date');
	const timeInput = document.getElementById('input-event-time');
	const notesInput = document.getElementById('input-event-notes');
	const reminderInput = document.getElementById('input-event-reminder');

	const title = titleInput.value.trim();
	const category = categoryInput ? categoryInput.value : 'medical';
	const location = locationInput ? locationInput.value : 'outing';
	const date = dateInput.value;
	const rawEndDate = endDateInput ? endDateInput.value : '';
	const time = timeInput.value;
	const notes = notesInput.value.trim();
	const reminder = reminderInput ? reminderInput.value.trim() : '';

	if (!title) {
		alert('Please enter an event or appointment title (e.g. "Dr. Miller - Eye Exam" or "Sarah Visiting").');
		titleInput.focus();
		return;
	}
	if (!date) {
		alert('Please select a start date.');
		dateInput.focus();
		return;
	}
	if (rawEndDate && rawEndDate < date) {
		alert('End date cannot be earlier than the start date.');
		if (endDateInput) endDateInput.focus();
		return;
	}
	const endDate = rawEndDate && rawEndDate > date ? rawEndDate : '';

	if (editingEventId) {
		const targetId = editingEventId;
		try {
			await database.ref(`board/events/${targetId}`).update({
				title,
				category,
				location,
				date,
				endDate,
				time: time || '',
				notes: notes || '',
				reminder: reminder || '',
				updatedAt: Date.now(),
				updatedBy: userProfile?.displayName || currentUser?.email || 'Caregiver',
			});
			cancelEditCalendarEvent();
			if (latestBoardData?.aiAutoRefresh !== false) {
				generateAiActionPlan({ silent: true });
			}
			showToast(`Event "${title}" updated!`);
		} catch (err) {
			console.error('Failed to update calendar event:', err);
			alert('Error updating event: ' + err.message);
		}
		return;
	}

	const eventId = 'evt_' + Date.now();
	const newEvent = {
		title,
		category,
		location,
		date,
		endDate,
		time: time || '',
		notes: notes || '',
		reminder: reminder || '',
		createdAt: Date.now(),
		createdBy: userProfile?.displayName || currentUser?.email || 'Caregiver',
	};

	try {
		await database.ref(`board/events/${eventId}`).set(newEvent);
		titleInput.value = '';
		if (categoryInput) categoryInput.value = 'medical';
		if (locationInput) locationInput.value = 'outing';
		if (endDateInput) endDateInput.value = '';
		timeInput.value = '';
		notesInput.value = '';
		if (reminderInput) reminderInput.value = '';
		if (latestBoardData?.aiAutoRefresh !== false) {
			generateAiActionPlan({ silent: true });
		}
		showToast(`Event "${title}" added to calendar!`);
	} catch (err) {
		console.error('Failed to add calendar event:', err);
		alert('Error adding event: ' + err.message);
	}
}

async function deleteCalendarEvent(eventId) {
	const evt = currentEventsMap[eventId];
	const title = evt ? evt.title : 'this appointment';
	const proceed = confirm(`Remove "${title}" from the calendar?`);
	if (!proceed) return;

	try {
		if (editingEventId === eventId) {
			cancelEditCalendarEvent();
		}
		await database.ref(`board/events/${eventId}`).remove();
		if (latestBoardData?.aiAutoRefresh !== false) {
			generateAiActionPlan({ silent: true });
		}
		showToast(`Appointment removed from calendar.`);
	} catch (err) {
		console.error('Failed to remove event:', err);
		alert('Error removing appointment: ' + err.message);
	}
}



// Notification System & Preferences
function notifyMedicationTaken(time) {
	const timeStr = time
		? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
		: 'just now';

	playNotificationChime();

	if ('Notification' in window && Notification.permission === 'granted') {
		try {
			new Notification('Medication Logged', {
				body: `Medications were recorded as taken at ${timeStr}.`,
				icon: 'https://cdn-icons-png.flaticon.com/512/883/883360.png',
			});
		} catch (e) {
			console.warn('System notification error:', e);
		}
	}

	showToast(`Medications were taken today at ${timeStr}!`);
}

function playNotificationChime() {
	try {
		const AudioCtx = window.AudioContext || window.webkitAudioContext;
		if (!AudioCtx) return;
		const ctx = new AudioCtx();
		const now = ctx.currentTime;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();

		osc.type = 'sine';
		osc.frequency.setValueAtTime(587.33, now); // D5
		osc.frequency.setValueAtTime(880, now + 0.15); // A5
		gain.gain.setValueAtTime(0.2, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start(now);
		osc.stop(now + 0.6);
	} catch (e) {
		console.warn('Audio chime unavailable:', e);
	}
}

function showToast(message) {
	const toast = document.getElementById('toast-notification');
	const msgEl = document.getElementById('toast-message');
	if (!toast) return;
	if (msgEl) msgEl.innerText = message;
	toast.classList.remove('-translate-y-24', 'opacity-0', 'pointer-events-none');
	toast.classList.add('translate-y-0', 'opacity-100');
	setTimeout(() => hideToast(), 8000);
}

function hideToast() {
	const toast = document.getElementById('toast-notification');
	if (toast) {
		toast.classList.add('-translate-y-24', 'opacity-0', 'pointer-events-none');
		toast.classList.remove('translate-y-0', 'opacity-100');
	}
}

async function toggleNotificationPref(checked) {
	if (!currentUser) return;
	if (!userProfile) userProfile = {};
	userProfile.notifyOnMeds = checked;

	const profileBox = document.getElementById('input-profile-notify-meds');
	if (profileBox) profileBox.checked = checked;

	try {
		await database.ref(`users/${currentUser.uid}/notifyOnMeds`).set(checked);
		console.log('Saved notification preference:', checked);
		if (checked && 'Notification' in window && Notification.permission !== 'granted') {
			requestBrowserNotificationPermission();
		}
	} catch (err) {
		console.warn('Failed to save notification preference:', err);
	}
}

async function requestBrowserNotificationPermission() {
	if (!('Notification' in window)) {
		alert('This browser does not support desktop notifications.');
		return;
	}
	const perm = await Notification.requestPermission();
	updatePermStatus();
	if (perm === 'granted') {
		new Notification('Senior Message Board', {
			body: 'Notifications enabled! You will be alerted when meds are taken.',
			icon: 'https://cdn-icons-png.flaticon.com/512/883/883360.png',
		});
	}
}

function updatePermStatus() {
	const statusEl = document.getElementById('perm-status');
	const btnEl = document.getElementById('btn-request-perm');
	if (!('Notification' in window)) {
		if (statusEl) statusEl.innerText = 'Desktop notifications not supported in this browser.';
		if (btnEl) btnEl.classList.add('hidden');
		return;
	}
	if (Notification.permission === 'granted') {
		if (statusEl) statusEl.innerText = 'Browser notifications: Allowed';
		if (btnEl) {
			btnEl.innerText = 'Allowed';
			btnEl.disabled = true;
			btnEl.classList.add('opacity-50');
		}
	} else if (Notification.permission === 'denied') {
		if (statusEl) statusEl.innerText = 'Browser notifications: Blocked in browser settings';
		if (btnEl) {
			btnEl.innerText = 'Blocked';
			btnEl.disabled = true;
			btnEl.classList.add('opacity-50');
		}
	} else {
		if (statusEl) statusEl.innerText = 'Browser notifications: Not yet granted';
		if (btnEl) {
			btnEl.innerText = 'Enable Browser Alerts';
			btnEl.disabled = false;
			btnEl.classList.remove('opacity-50');
		}
	}
}

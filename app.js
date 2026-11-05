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

			const weatherIcons = {
				0: '☀️',
				1: '🌤️',
				2: '⛅',
				3: '☁️',
				45: '🌫️',
				48: '🌫️',
				51: '🌦️',
				53: '🌦️',
				55: '🌦️',
				61: '🌧️',
				63: '🌧️',
				65: '🌧️',
				71: '❄️',
				73: '❄️',
				75: '❄️',
				95: '⛈️',
			};

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
			if (iconEl) iconEl.innerText = weatherIcons[code] || '\u{1F324}\uFE0F';
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
				icon: weatherIcons[code] || '🌤️',
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
	const tabs = ['daily', 'settings', 'people'];
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
					'py-2.5 px-4 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 bg-white text-blue-700 shadow-sm border border-slate-200/80';
			} else {
				btn.className =
					'py-2.5 px-4 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 text-slate-600 hover:text-slate-900';
			}
		}
	});
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

const DEFAULT_ROTATING_CHECKIN_QUESTIONS = [
	{
		id: 'morning_energy',
		startHour: 0,
		endHour: 12,
		question: 'How is your energy feeling this morning?',
		choices: [
			'Well-rested and energized',
			'Peaceful and taking it easy',
			'A bit slow or tired today',
		],
	},
	{
		id: 'afternoon_agenda',
		startHour: 12,
		endHour: 17,
		question: 'What is on your agenda this afternoon?',
		choices: [
			'Reading, puzzles, or crafts',
			'Enjoying fresh air or the porch',
			'Watching a favorite show or movie',
			'Taking a restful afternoon nap',
		],
	},
	{
		id: 'evening_dinner',
		startHour: 17,
		endHour: 24,
		question: 'What sounds good for dinner tonight?',
		choices: [
			'Warm soup or stew',
			'Pasta or comfort food',
			'A sandwich or light meal',
			'Whatever family brings',
		],
	},
];

function generateSmartFallbackQuestion(boardData) {
	const data = boardData || latestBoardData || {};
	const todayStr = getTodayDateString();
	const allEvents = Object.values(data.events || {}).filter(
		(e) => isEventUpcomingOrActive(e, todayStr) && getEventDaysFromToday(e) === 0
	);

	// Event-based context
	if (allEvents.length > 0) {
		const first = allEvents[0];
		const ctx = getEventContext(first);
		if (ctx.category === 'family') {
			return {
				question: `${first.title} is coming up today - what sounds nicest to enjoy together?`,
				choices: [
					'Chat over a fresh drink',
					'Share a meal or treats',
					'Sit outside on the porch',
					'Just relax and catch up',
				],
			};
		}
		if (ctx.category === 'medical') {
			return {
				question: `You have ${first.title} today - how are you feeling before heading out?`,
				choices: [
					'Ready and prepared',
					'Taking things slow and steady',
					'A bit tired or rushed',
					'Looking forward to getting it done',
				],
			};
		}
	}

	// Weather-based context
	if (lastWeatherData) {
		const rainChance = lastWeatherData.rainChanceMax || 0;
		const high = lastWeatherData.high || 70;
		if (rainChance >= 60) {
			return {
				question: 'It looks rainy today - what sounds most comforting to enjoy indoors?',
				choices: [
					'A warm drink and a good book',
					'Working on a favorite puzzle',
					'Watching a movie or show',
					'Taking an afternoon rest',
				],
			};
		}
		if (high >= 65 && high <= 82) {
			return {
				question: 'The weather looks pleasant today - would you like to enjoy some fresh air?',
				choices: [
					'Sit on the porch or patio',
					'Take a short stroll',
					'Open windows for fresh air',
					'Stay cozy inside',
				],
			};
		}
	}

	// Time-of-day dinner context
	const curHour = new Date().getHours();
	if (curHour >= 16) {
		return {
			question: 'What sounds most appetizing for dinner tonight?',
			choices: [
				'Warm soup or stew',
				'Pasta or comfort food',
				'A sandwich or light salad',
				'Whatever family brings',
			],
		};
	}

	return null;
}

function getActiveCheckinQuestion(boardData) {
	const data = boardData || latestBoardData || {};
	// 1. Explicit Admin custom question override
	if (data.customCheckinQuestion && data.customCheckinQuestion.trim()) {
		const qText = data.customCheckinQuestion.trim();
		let choices = ['Yes', 'No', 'Not sure'];
		if (data.customCheckinChoices && data.customCheckinChoices.trim()) {
			const parsed = data.customCheckinChoices
				.split(',')
				.map((c) => c.trim())
				.filter(Boolean);
			if (parsed.length > 0) choices = parsed;
		}
		return { question: qText, choices, source: 'Custom' };
	}

	// 2. AI-generated dynamic question for today
	const todayStr = getTodayDateString();
	if (
		data.aiQuestion &&
		data.aiQuestion.question &&
		Array.isArray(data.aiQuestion.choices) &&
		data.aiQuestion.choices.length >= 2 &&
		data.aiQuestion.generatedDate === todayStr
	) {
		return {
			question: data.aiQuestion.question.trim(),
			choices: data.aiQuestion.choices.map((c) => c.trim()).filter(Boolean),
			source: 'AI Generated',
		};
	}

	// 3. Fallback smart context-aware question based on today's events, weather, or time of day
	const smartQ = generateSmartFallbackQuestion(data);
	if (smartQ) {
		return { ...smartQ, source: 'Smart Dynamic' };
	}

	// 4. Default time-of-day rotation
	const curHour = new Date().getHours();
	const active =
		DEFAULT_ROTATING_CHECKIN_QUESTIONS.find(
			(q) => curHour >= q.startHour && curHour < q.endHour
		) || DEFAULT_ROTATING_CHECKIN_QUESTIONS[0];

	return { question: active.question, choices: active.choices, source: 'Default' };
}

function renderSeniorCheckin(boardData) {
	const data = boardData || latestBoardData || {};
	const sectionEl = document.getElementById('disp-senior-checkin-section');
	const qEl = document.getElementById('disp-checkin-question');
	const optionsEl = document.getElementById('disp-checkin-options');
	const confirmEl = document.getElementById('disp-checkin-confirmation');
	const answerTextEl = document.getElementById('disp-checkin-answer-text');
	const timeTextEl = document.getElementById('disp-checkin-time-text');
	const badgeEl = document.getElementById('disp-checkin-status-badge');

	if (!sectionEl || !qEl || !optionsEl || !confirmEl) return;

	const { question, choices } = getActiveCheckinQuestion(data);
	qEl.innerText = question;

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

	const hasAnsweredToday = resp && resp.dateStr === todayStr && resp.answer;

	if (hasAnsweredToday) {
		optionsEl.classList.add('hidden');
		confirmEl.classList.remove('hidden');
		if (badgeEl) badgeEl.classList.remove('hidden');
		if (answerTextEl) answerTextEl.innerText = resp.answer;
		if (timeTextEl) {
			const timeStr = resp.timestamp
				? new Date(resp.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
				: '';
			timeTextEl.innerText = timeStr ? `Logged today at ${timeStr}` : 'Logged for today';
		}
	} else {
		confirmEl.classList.add('hidden');
		optionsEl.classList.remove('hidden');
		if (badgeEl) badgeEl.classList.add('hidden');

		optionsEl.innerHTML = choices
			.map(
				(choice) => `
				<button
					type="button"
					onclick="submitSeniorCheckin('${escapeHtml(choice).replace(/'/g, "\\'")}')"
					class="w-full text-left px-5 py-4 bg-white hover:bg-blue-50 active:bg-blue-600 active:text-white rounded-2xl border-2 border-blue-300 hover:border-blue-500 text-slate-950 font-bold text-xl sm:text-2xl transition shadow-xs cursor-pointer leading-snug"
				>
					${escapeHtml(choice)}
				</button>
			`
			)
			.join('');
	}

	renderAdminCheckinResponse(resp, todayStr);
}

async function submitSeniorCheckin(choice) {
	const todayStr = getTodayDateString();
	const { question } = getActiveCheckinQuestion(latestBoardData);
	const responsePayload = {
		question: question,
		answer: choice,
		timestamp: Date.now(),
		dateStr: todayStr,
	};

	try {
		localStorage.setItem('smb_local_senior_response', JSON.stringify(responsePayload));
	} catch (e) {}

	if (!latestBoardData) latestBoardData = {};
	latestBoardData.seniorResponse = responsePayload;
	if (!latestBoardData.seniorHistory) latestBoardData.seniorHistory = {};
	const histKey = `resp_${Date.now()}`;
	latestBoardData.seniorHistory[histKey] = responsePayload;

	try {
		localStorage.setItem('smb_local_senior_history', JSON.stringify(latestBoardData.seniorHistory));
	} catch (e) {}

	renderSeniorCheckin(latestBoardData);

	try {
		await database.ref('board/seniorResponse').set(responsePayload);
		await database.ref(`board/seniorHistory/${histKey}`).set(responsePayload);
		console.log('Senior check-in response and history synced to Firebase');
	} catch (err) {
		console.warn('Firebase sync of senior check-in failed (check database rules):', err);
	}

	renderAiSummaryCard();
}

function resetSeniorCheckinChoice() {
	const optionsEl = document.getElementById('disp-checkin-options');
	const confirmEl = document.getElementById('disp-checkin-confirmation');
	if (optionsEl) optionsEl.classList.remove('hidden');
	if (confirmEl) confirmEl.classList.add('hidden');
}

function renderAdminCheckinResponse(resp, todayStr) {
	const respTextEl = document.getElementById('admin-checkin-response-text');
	const clearBtn = document.getElementById('btn-admin-clear-checkin');
	const activeQInfoEl = document.getElementById('admin-active-question-info');
	const historyEl = document.getElementById('admin-checkin-history');
	if (!respTextEl) return;

	// Show current active question info
	const activeQ = getActiveCheckinQuestion(latestBoardData);
	if (activeQInfoEl) {
		activeQInfoEl.innerHTML = `Active Question: <em>"${escapeHtml(activeQ.question)}"</em> <span class="text-[10px] font-semibold text-slate-500">(${activeQ.source || 'Auto'})</span>`;
	}

	if (resp && resp.dateStr === todayStr && resp.answer) {
		const timeStr = resp.timestamp
			? new Date(resp.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
			: '';
		respTextEl.innerHTML = `<strong>${escapeHtml(resp.answer)}</strong> (for <em>"${escapeHtml(resp.question || 'Daily Check-In')}"</em>${timeStr ? ' at ' + timeStr : ''})`;
		if (clearBtn) clearBtn.classList.remove('hidden');
	} else {
		respTextEl.innerText = 'No response logged yet today.';
		if (clearBtn) clearBtn.classList.add('hidden');
	}

	// Render recent history list
	if (historyEl) {
		let historyMap = latestBoardData?.seniorHistory;
		if (!historyMap) {
			try {
				const rawHist = localStorage.getItem('smb_local_senior_history');
				if (rawHist) historyMap = JSON.parse(rawHist);
			} catch (e) {}
		}
		const historyList = Object.values(historyMap || {})
			.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
			.slice(0, 3);

		if (historyList.length > 0) {
			historyEl.innerHTML = '<strong>Recent Feedback:</strong> ' + historyList.map(h => `${escapeHtml(h.answer)} <span class="text-slate-400">(${h.dateStr})</span>`).join(' \u2022 ');
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
				<div class="text-3xl text-slate-300">💬</div>
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
				<div class="p-4 sm:p-5 bg-slate-50/90 rounded-2xl border border-slate-200 space-y-2.5 shadow-2xs">
					<p class="text-xl sm:text-2xl font-bold text-slate-900 leading-snug whitespace-pre-line">${escapeHtml(msg.text)}</p>
					<div class="flex items-center justify-between text-sm sm:text-base text-slate-600 pt-2 border-t border-slate-200/80">
						<span class="font-black text-blue-800 flex items-center gap-1.5">
							<span class="text-slate-500 font-medium">From</span> ${escapeHtml(msg.author || 'Family')}
						</span>
						<span class="text-xs sm:text-sm font-semibold text-slate-500">${escapeHtml(formattedDate)}</span>
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
				<div class="text-3xl text-slate-300">💊</div>
				<div class="text-xl sm:text-2xl font-black text-slate-800">No medications listed</div>
				<div class="text-sm sm:text-base font-semibold text-slate-500">Add medications in the caregiver panel.</div>
			</div>
		`;
		return;
	}

	container.innerHTML = medsList
		.map(
			(med) => `
			<div class="p-3.5 sm:p-4 bg-slate-50/90 rounded-2xl border border-slate-200 space-y-1.5">
				<div class="flex items-center justify-between gap-2">
					<span class="font-black text-xl sm:text-2xl text-slate-900">${escapeHtml(med.name)}</span>
					${
						med.time
							? `<span class="text-sm sm:text-base font-black px-3 py-1 rounded-lg bg-purple-100 text-purple-900 border border-purple-300 shrink-0">${escapeHtml(med.time)}</span>`
							: ''
					}
				</div>
				${
					med.notes
						? `<p class="text-base sm:text-lg text-slate-700 leading-relaxed font-semibold pl-0.5">${escapeHtml(med.notes)}</p>`
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
			medBtn.innerHTML = '<span>✅ MEDS LOGGED</span>';
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
			medBtn.innerHTML = '<span>💊 I TOOK MY MEDS</span>';
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

	// Render AI Daily Action Plan & Prep Card
	renderAiSummaryCard();

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

	// Bullet 4: Multi-Day Prep or Next-Few-Days Pacing (with bolded action)
	if (prepAlerts.length > 0) {
		let cleanAlert = prepAlerts[0].replace(/^[\p{Emoji}\s]+/u, '').trim();
		if (!cleanAlert.includes('**')) {
			cleanAlert = cleanAlert.replace(
				/^(Drink [^.,]+|Wear [^.,]+|Bundle up [^.,]+|Rest [^.,]+|Bring [^.,]+|Set out [^.,]+|Confirm [^.,]+|Take [^.,]+)/i,
				'**$1**'
			);
		}
		todayPlan.push(cleanAlert);
	} else if (lookAheadParts.length > 0) {
		let cleanLook = lookAheadParts[0].trim();
		if (!cleanLook.includes('**')) {
			cleanLook = cleanLook.replace(
				/(Lay out [^.,]+|Confirm [^.,]+|Enjoy [^.,]+|Rest [^.,]+)/i,
				'**$1**'
			);
		}
		todayPlan.push(cleanLook);
	}

	// Bullet 5: Senior Check-In Response acknowledgment (if answered today)
	if (seniorResp && seniorResp.answer) {
		const qLower = (seniorResp.question || '').toLowerCase();
		const ansText = seniorResp.answer;
		if (qLower.includes('dinner') || qLower.includes('eat') || qLower.includes('food')) {
			todayPlan.push(`Dinner preference noted: ${ansText}. **Enjoy a comforting dinner** this evening.`);
		} else if (qLower.includes('stroll') || qLower.includes('porch') || qLower.includes('air') || qLower.includes('outside')) {
			todayPlan.push(`Check-in response noted: ${ansText}. **Enjoy the fresh air and sunshine** at your own pace.`);
		} else {
			todayPlan.push(`Check-in response logged: "${ansText}". **Have a wonderful, restful afternoon**.`);
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
			<ul class="space-y-3.5 sm:space-y-4">
				<li class="flex items-start gap-3 sm:gap-3.5">
					<span class="inline-block w-2.5 h-2.5 sm:w-3 sm:h-3 mt-2 sm:mt-2.5 rounded-full bg-blue-600 shrink-0" aria-hidden="true"></span>
					<span class="text-xl sm:text-2xl font-medium text-slate-800 leading-snug">
						Take your day at a gentle pace. <strong class="font-black text-slate-950">Keep a glass of water nearby</strong> and enjoy a relaxing day.
					</span>
				</li>
			</ul>
		`;
	} else {
		todayPlanEl.innerHTML = `
			<ul class="space-y-3.5 sm:space-y-4">
				${todayPlan
					.map((item) => {
						const formatted = formatActionBulletHtml(item);
						return `
							<li class="flex items-start gap-3 sm:gap-3.5">
								<span class="inline-block w-2.5 h-2.5 sm:w-3 sm:h-3 mt-2 sm:mt-2.5 rounded-full bg-blue-600 shrink-0" aria-hidden="true"></span>
								<span class="text-xl sm:text-2xl font-medium text-slate-800 leading-snug">
									${formatted}
								</span>
							</li>
						`;
					})
					.join('')}
			</ul>
		`;
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
		// Instant Smart Care Companion generation without requiring an external key
		if (userProfile && (userProfile.role === 'ADMIN' || userProfile.role === 'EDITOR')) {
			await database.ref('board').update({
				aiRules: rulesText,
				aiSummary: {
					todayPlan: smartBaseline.todayPlan,
					prepAlerts: smartBaseline.prepAlerts,
					lookAhead: smartBaseline.lookAhead,
					source: 'smart',
					generatedDate: todayStr,
					updatedAt: Date.now(),
				},
			});
		}
		renderAiSummaryCard();
		if (!silent) {
			showToast('\u2728 Conversational Action Plan refreshed!');
		}
		return;
	}

	// Call Gemini 3.8 Flash via the official Gemini Interactions API
	if (btn) btn.disabled = true;
	if (btnText) btnText.innerText = 'Generating with Gemini AI...';

	try {
		if (!lastWeatherData && latestBoardData?.zipcode) {
			try {
				await updateWeather(latestBoardData.zipcode);
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

		const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Api-Revision': '2026-05-20',
				'x-goog-api-key': apiKey,
			},
			body: JSON.stringify({
				model: 'gemini-3.8-flash',
				store: false,
				system_instruction:
					'You are a loving, thoughtful family member speaking directly to an older adult ("you") on their home message board.\n' +
					'Your voice is warm, natural, colloquial, and genuinely human. Avoid robotic checklists, clinical instructions, or automated assistant cliches.\n\n' +
					'CRITICAL RULES:\n' +
					'1. `todayPlan` (AN ARRAY OF 3 TO 5 CONCISE BULLET POINTS, NEVER USE EMOJIS):\n' +
					'   - WEATHER BULLET: Describe how today feels naturally. CRITICAL: DO NOT use ANY numbers, digits (0-9), degree symbols, or percentages. Use natural descriptions like "crisp morning", "mild and pleasant", or "rainy afternoon".\n' +
					'   - BOLD ACTIONS: In each bullet point, BOLD any specific action the senior should take using markdown **action text** (e.g. **Take your morning pills with breakfast**, **Put on a warm sweater**, **Bring your insurance card and glasses**, **Drink extra water**).\n' +
					'   - SCHEDULE BULLET: Thoughts tailored to today\'s schedule (family visit, errand, doctor, or a restful open day).\n' +
					'   - MULTI-DAY PREP BULLET: Proactive prep for upcoming events in the next few days.\n' +
					'   - CHECK-IN ACKNOWLEDGMENT: If senior already answered today\'s check-in question (`seniorCheckIn`), warmly weave their choice into a bullet.\n' +
					'2. `dailyQuestion`: Create ONE thoughtful, engaging check-in question for the senior for today based on live context (weather, today\'s plans, or learning from their recent choices in `seniorRecentHistoryAndFeedback`). Provide 3 or 4 distinct, senior-friendly choices (each under 6 words). DO NOT include emojis or icons in the question or choices.\n' +
					'3. LEARN FROM THE SENIOR: Review `seniorRecentHistoryAndFeedback`. Notice what they enjoy or if they felt tired recently. Acknowledge and build on their real habits rather than guessing.\n' +
					'4. CAREGIVER GUIDANCE: If `caregiverNotesAndFeedback` is provided, follow every detail faithfully.\n' +
					'5. `prepAlerts`: 1 to 2 short proactive reminders for upcoming appointments (e.g. extra hydration before an infusion).\n' +
					'6. `lookAhead`: Exactly 1 warm sentence on pacing the next few days.',
				input:
					'Write a concise, conversational Daily Companion & Action Plan JSON from this live board context:\n' +
					JSON.stringify(boardSnapshot, null, 2),
				response_format: {
					type: 'text',
					mime_type: 'application/json',
					schema: {
						type: 'object',
						properties: {
							todayPlan: {
								type: 'array',
								items: { type: 'string' },
								description:
									'An array of 3 to 5 concise bullet point strings. Each bullet has bold markdown **action text** for any required action. The weather bullet MUST NOT contain any numbers, digits, degree symbols, or percentages.',
							},
							prepAlerts: {
								type: 'array',
								items: { type: 'string' },
								description:
									'1 to 2 short, concise coaching sentences giving proactive multi-day preparation advice tailored to upcoming event context and caregiver prep rules.',
							},
							lookAhead: {
								type: 'string',
								description:
									'1 short, warm sentence on how to pace energy over the next 3 to 5 days.',
							},
							dailyQuestion: {
								type: 'object',
								properties: {
									question: {
										type: 'string',
										description: 'A friendly, single-sentence check-in question directly relevant to today. No emojis.',
									},
									choices: {
										type: 'array',
										items: { type: 'string' },
										description: '3 or 4 distinct answer choices under 6 words each. No emojis.',
									},
								},
								required: ['question', 'choices'],
							},
						},
						required: ['todayPlan', 'prepAlerts', 'lookAhead', 'dailyQuestion'],
					},
				},
			}),
		});

		if (!response.ok) {
			const errText = await response.text();
			throw new Error(`Gemini API HTTP ${response.status}: ${errText}`);
		}

		const result = await response.json();
		let rawJsonText = '';
		if (typeof result.output_text === 'string' && result.output_text) {
			rawJsonText = result.output_text;
		} else if (Array.isArray(result.steps)) {
			for (let i = result.steps.length - 1; i >= 0; i--) {
				const step = result.steps[i];
				if (step && step.type === 'model_output' && Array.isArray(step.content)) {
					const textParts = step.content
						.filter((part) => part && part.type === 'text' && typeof part.text === 'string')
						.map((part) => part.text);
					if (textParts.length > 0) {
						rawJsonText = textParts.join('');
						break;
					}
				}
			}
		}

		const parsed = JSON.parse(rawJsonText);
		const finalTodayPlan =
			Array.isArray(parsed.todayPlan) && parsed.todayPlan.length >= 2
				? parsed.todayPlan.slice(0, 5)
				: smartBaseline.todayPlan;
		const finalPrepAlerts =
			Array.isArray(parsed.prepAlerts) && parsed.prepAlerts.length > 0
				? parsed.prepAlerts
				: smartBaseline.prepAlerts;
		const finalLookAhead = parsed.lookAhead || smartBaseline.lookAhead;

		const finalAiQuestion =
			(parsed.dailyQuestion && parsed.dailyQuestion.question && Array.isArray(parsed.dailyQuestion.choices) && parsed.dailyQuestion.choices.length >= 2)
				? {
					question: parsed.dailyQuestion.question.trim(),
					choices: parsed.dailyQuestion.choices.map((c) => c.trim()).filter(Boolean),
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
			await database.ref('board').update(updatePayload);
		}
		renderAiSummaryCard();
		if (!silent) {
			showToast('\u2728 Gemini AI Action Plan refreshed!');
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
						<span class="text-xs">🎂</span>
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
							? '<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">🔔 Alerts On</span>'
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
							? '<span class="text-emerald-700 text-xs font-semibold px-2.5 py-1 bg-emerald-50 rounded-lg border border-emerald-200">● Active</span>'
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
									<span>${isActive ? '● Active' : '○ Inactive'}</span>
								</button>
								<button
									type="button"
									onclick="deleteUserProfile('${uid}', '${displayName || email}')"
									class="text-slate-400 hover:text-rose-600 text-xs p-1.5 rounded-lg hover:bg-rose-50 transition"
									title="Permanently remove database record"
								>
									🗑️
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
					<div class="text-2xl">📇</div>
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
					<div class="p-4 bg-slate-50 rounded-2xl border ${
						bdayToday ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'
					} space-y-1">
						<div class="flex items-center justify-between gap-2 flex-wrap">
							<div class="font-black text-slate-900 text-xl sm:text-2xl flex items-center gap-2 flex-wrap">
								<span>${escapeHtml(c.name)}</span>
								${
									c.relation
										? `<span class="text-xs sm:text-sm font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${
												c.isUser
													? 'bg-blue-50 text-blue-700 border border-blue-200'
													: 'bg-white text-slate-600 border border-slate-200'
										  }">${escapeHtml(c.relation)}</span>`
										: ''
								}
							</div>
							${
								bdayText
									? `<span class="text-sm sm:text-base font-bold px-3 py-1 rounded-md border flex items-center gap-1.5 ${
											bdayToday
												? 'bg-amber-100 text-amber-800 border-amber-300 font-bold'
												: 'bg-white text-slate-600 border-slate-200'
									  }">🎂 ${bdayText}${bdayToday ? ' (TODAY!)' : ''}</span>`
									: ''
							}
						</div>
						<div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-base sm:text-lg text-slate-900 font-bold">
							${c.phone ? `<span>📞 ${escapeHtml(c.phone)}</span>` : ''}
							${c.email ? `<span class="truncate">✉️ ${escapeHtml(c.email)}</span>` : ''}
						</div>
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
										? `<span class="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">🎂 ${bdayText}</span>`
										: ''
								}
								${
									isEditingThis
										? '<span class="text-[10px] font-bold uppercase tracking-wider bg-blue-600 text-white px-1.5 py-0.5 rounded">Editing</span>'
										: ''
								}
							</div>
							<div class="text-xs text-slate-500 truncate">
								${[c.phone ? `📞 ${escapeHtml(c.phone)}` : '', c.email ? `✉️ ${escapeHtml(c.email)}` : '']
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
	const n = (name || '').toLowerCase();
	if (n.includes('new year')) return '🎉';
	if (n.includes('valentine')) return '❤️';
	if (n.includes('patrick')) return '🍀';
	if (n.includes('easter')) return '🌷';
	if (n.includes('mother')) return '💐';
	if (n.includes('father')) return '👔';
	if (n.includes('independence') || n.includes('july')) return '🎆';
	if (n.includes('halloween')) return '🎃';
	if (n.includes('thanksgiving')) return '🦃';
	if (n.includes('christmas')) return '🎄';
	if (n.includes('memorial') || n.includes('veterans') || n.includes('president')) return '🇺🇸';
	if (n.includes('labor')) return '🛠️';
	return '🌟';
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
				<div class="text-lg">🌿</div>
				<div class="text-sm sm:text-base font-bold text-slate-700">No events scheduled for today</div>
				<div class="text-xs text-slate-500">Enjoy a relaxing day!</div>
			</div>
		`;
		return;
	}

	let todayHtml = '';

	// 1. Render any US Holiday falling on today
	todaysHolidays.forEach((h) => {
		const emoji = getHolidayEmoji(h.name);
		todayHtml += `
			<div class="w-full bg-amber-50 p-4 rounded-2xl border-2 border-amber-300 shadow-sm flex items-center gap-3.5">
				<span class="text-2xl shrink-0">${emoji}</span>
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
				<span class="text-2xl shrink-0">🎂</span>
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
							? `<span class="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">📅 ${escapeHtml(
									rangeLabel
							  )}</span>`
							: ''
					}
					${
						time
							? `<span class="text-xs sm:text-sm font-bold text-blue-800 bg-blue-50 border border-blue-200 px-3 py-1 rounded-md flex items-center gap-1.5">⏰ ${time}</span>`
							: ''
					}
				</div>
				<div class="text-xl sm:text-2xl font-black text-slate-900 pt-0.5 leading-snug">
					${escapeHtml(evt.title)}
				</div>
				${
					evt.notes
						? `<div class="text-base sm:text-lg text-slate-700 font-semibold flex items-center gap-2"><span class="text-lg">🚗</span> ${escapeHtml(
								evt.notes
						  )}</div>`
						: ''
				}
				${
					evt.reminder
						? `<div class="text-base sm:text-lg text-indigo-800 font-bold flex items-center gap-2 pt-0.5"><span class="text-lg">💡</span> ${escapeHtml(
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
					<div class="text-2xl">🌿</div>
					<div class="text-base font-bold text-slate-700">No appointments scheduled</div>
					<div class="text-xs text-slate-500">Relax and enjoy your day! ☀️</div>
				</div>
			`;
		} else {
			let html = '';
			combinedDisplayItems.forEach((item) => {
				if (item.itemType === 'holiday') {
					const h = item.holiday;
					const emoji = getHolidayEmoji(h.name);
					const { formattedDate, countdown, badgeClass } = formatHolidayCountdown(h.date);
					html += `
						<div class="w-full bg-amber-50/50 p-4 sm:p-5 rounded-2xl border border-amber-200 flex items-center justify-between gap-3">
							<div class="flex items-center gap-3 min-w-0">
								<span class="text-2xl shrink-0">${emoji}</span>
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
											? `<span class="text-xs sm:text-sm font-bold text-blue-800 bg-blue-50 border border-blue-200 px-3 py-1 rounded-md flex items-center gap-1.5">⏰ ${time}</span>`
											: ''
									}
								</div>
								<div class="text-2xl sm:text-3xl font-black text-slate-900 pt-1 leading-snug">
									${escapeHtml(evt.title)}
								</div>
								${
									evt.notes
										? `<div class="text-base sm:text-lg text-slate-700 font-semibold flex items-center gap-2 pt-0.5"><span class="text-lg">🚗</span> ${escapeHtml(
												evt.notes
										  )}</div>`
										: ''
								}
								${
									evt.reminder
										? `<div class="text-xs sm:text-sm text-indigo-700 font-semibold flex items-center gap-1.5 pt-0.5"><span class="text-sm">💡</span> ${escapeHtml(
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
					const map = { medical: '🩺 Medical', family: '🏡 Visit', errand: '🚗 Errand', service: '🔧 Service', other: '⭐ Other' };
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
									? `<div class="text-xs text-indigo-600 font-medium truncate pl-0.5">💡 Reminder: ${escapeHtml(evt.reminder)}</div>`
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
			new Notification('💊 Medication Logged', {
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

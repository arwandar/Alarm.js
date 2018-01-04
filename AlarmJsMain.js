require("console-stamp")(console, {
	pattern: "dd/mm/yyyy HH:MM:ss.l"
});

// REQUIRE //
var schedule = require('node-schedule'),
express = require('express'),
bodyParser = require('body-parser'),
urlencodedParser = bodyParser.urlencoded({
		extended: false
	}),
querystring = require('querystring'),
storage = require('node-persist'),
Promise = require('bluebird'),
auth = require('express-authentication'),
basic = require('express-authentication-basic'),
reqprom = require('request-promise'),
crypto = require('crypto');

// VARIABLES DE CONFIGURATION //
var config;
const app = express();

// INIT
storage.init({
	logging: true
}).then(function () {
	//storage.clearSync();
	config = storage.getItemSync('config');
	if (!config) {
		config = {
			expressPort: 3002,
			adressSpotUtils: "http://localhost:3003/playAlarm/arwy/spotify:user:1157350694:playlist:6fUQlgaNPG2Drmif2sjyn1",
			userSpotUtils: "tempo",
			passwordSpotUtils: "tempo",
			debug: false
		}
		console.error("Veuillez setter les identifiants pour spotutils dans la config");
		storage.setItem('config', config);
	}
	console.log(config);

	app.listen(config.expressPort, function () {
		console.log('Server started')
	})

	let repetitiveAlarms = storage.valuesWithKeyMatch(/repetitiveAlarms\_/);
	for (let i in repetitiveAlarms) {
		if (!repetitiveAlarms[i].name)
			repetitiveAlarms[i].name = repetitiveAlarms[i].id;
		startRepetitiveAlarm(repetitiveAlarms[i]);
	}
	let singleAlarms = storage.valuesWithKeyMatch(/singleAlarms\_/);
	for (let i in singleAlarms) {
		if (!singleAlarms[i].name)
			singleAlarms[i].name = singleAlarms[i].id;
		startSingleAlarm(singleAlarms[i]);
	}
});

// LANCEMENT DES ALARMES
function startSingleAlarm(alarm) {
	let dateTmp = new Date(alarm.date);
	schedule.scheduleJob(alarm.id, alarm.date, function () {
		console.log(alarm.name);
		play();
	});
	console.log(alarm.name, "lancée (single)")

	if (!schedule.scheduledJobs[alarm.id].nextInvocation()) {
		storage.removeItemSync('singleAlarms_' + alarm.id);
		schedule.scheduledJobs[alarm.id].cancel();
		console.log(alarm.name, "supprimée")
	}
}

function startRepetitiveAlarm(alarm) {
	let timeTable = alarm.time.split(':');
	var cronString = timeTable[1] + ' ' + timeTable[0] + ' * * ';

	var days = {
		'monday': 1,
		'tuesday': 2,
		'wednesday': 3,
		'thursday': 4,
		'friday': 5,
		'saturday': 6,
		'sunday': 7
	};

	for (let d in days) {
		if (alarm[d]) {
			cronString += days[d] + ',';
		}
	}
	schedule.scheduleJob(alarm.id, cronString.substring(0, cronString.length - 1), function () {
		console.log(alarm.name);
		play();
	});
	console.log(alarm.name, "lancée (repetitive)")
}

// AJOUT D'UNE ALARME EN BDD
function addAlarm(obj, table) {
	return new Promise(function (resolve, reject) {
		obj.id = crypto.randomBytes(8).toString("hex");
		storage.setItemSync(table + '_' + obj.id, obj);
		resolve(obj.id);
	});
}

function updateAlarm(obj, table, callback) {
	return new Promise(function (resolve, reject) {
		storage.setItemSync(table + '_' + obj.id, obj);
		resolve();
	});
}

// LECTURE DE LA MUSIQUE
function play() {
	console.log('beginning of the play function');
	if (!config.debug) {
		reqprom(config.adressSpotUtils, {
			'auth': {
				'user': config.userSpotUtils,
				'pass': config.passwordSpotUtils,
				'sendImmediately': false
			}
		});
	}
}

// CREATION DU SERVEUR EXPRESS

app.use(express.static('public'))
.use(bodyParser.json())
.use(bodyParser.urlencoded({
		extended: true
	}));

app.get('/', function (req, res) {
	res.render('index.ejs');
})

app.get('/test', function (req, res) {
	play();
	res.status(204).send();
})

app.get('/singleAlarmsList', function (req, res) {
	let singleAlarms = storage.valuesWithKeyMatch(/singleAlarms\_/);
	res.status(200).render('partials/singleAlarmsList.ejs', {
		alarms: singleAlarms
	});
})

app.get('/repetitiveAlarmsList', function (req, res) {
	let repetitiveAlarms = storage.valuesWithKeyMatch(/repetitiveAlarms\_/);
	res.status(200).render('partials/repetitiveAlarmsList.ejs', {
		alarms: repetitiveAlarms
	});
})

app.post('/single', function (req, res) {
	var row = {
		'id': req.body['modal-id'].length < 1 ? undefined : req.body['modal-id'],
		'name': req.body['modal-name'],
		'date': req.body['modal-date'] + ' ' + req.body['modal-time']
	}
	console.log('/single', row);
	if (row.id) {
		updateAlarm(row, 'singleAlarms')
		.then(function () {
			schedule.scheduledJobs[row.id].cancel();
			console.log(row.id + " annulée dans singleSchedules");
			startSingleAlarm(row);
		})
	} else {
		addAlarm(row, 'singleAlarms')
		.then(function (id) {
			row.id = id;
			startSingleAlarm(row);
			res.status(200).send();
		});
	}
})

app.post('/repetitive', function (req, res) {
	function set(i) {
		return i ? i : 0
	}
	var row = {
		'id': req.body['modal-id'].length < 1 ? undefined : req.body['modal-id'],
		'name': req.body['modal-name'],
		'time': req.body['modal-time'],
		'monday': set(req.body['modal-day-0']),
		'tuesday': set(req.body['modal-day-1']),
		'wednesday': set(req.body['modal-day-2']),
		'thursday': set(req.body['modal-day-3']),
		'friday': set(req.body['modal-day-4']),
		'saturday': set(req.body['modal-day-5']),
		'sunday': set(req.body['modal-day-6'])
	}
	console.log('/repetitive', row);
	if (row.id) {
		updateAlarm(row, 'repetitiveAlarms')
		.then(function () {
			schedule.scheduledJobs[row.id].cancel();
			console.log(row.id + " annulée dans repetitiveSchedules");
			startRepetitiveAlarm(row);
			res.status(200).send();
		})
	} else {
		addAlarm(row, 'repetitiveAlarms')
		.then(function (id) {
			row.id = id[0];
			startRepetitiveAlarm(row);
			res.status(200).send();
		});
	}
})

app.delete ('/singles/:id', function (req, res) {
	var idToDelete = req.params.id;
	console.log("suppression de la single", idToDelete);
	schedule.scheduledJobs[req.params.id].cancel();
	storage.removeItemSync('singleAlarms_' + req.params.id);
	res.status(204).send();
})

app.delete ('/repetitives/:id', function (req, res) {
	var idToDelete = req.params.id;
	console.log("suppression de la repetitive", idToDelete);
	schedule.scheduledJobs[req.params.id].cancel();
	storage.removeItemSync('repetitiveAlarms_' + req.params.id);
	res.status(204).send();
})

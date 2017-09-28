require("console-stamp")(console, {
    pattern: "dd/mm/yyyy HH:MM:ss.l"
});

// REQUIRE //
const fs = require('fs');
const lame = require('lame');
const Speaker = require('speaker');
const schedule = require('node-schedule');
const express = require('express');
const Knex = require('knex');
var bodyParser = require('body-parser'); // Charge le middleware de gestion des paramètres
var urlencodedParser = bodyParser.urlencoded({
    extended: false
});

// VARIABLES DE CONFIGURATION //
const bddParams = {
    "host": 'localhost',
    "database": 'Alarm',
    "user": 'Alarm',
    "password": 'Cyrille',
    "charset": "utf8mb4_unicode_ci",
    "timezone": "UTC"
}
const expressPort = 3002;
const dir = "/home/pi/Music/";

// VARIABLES GLOBALES //
var repetitiveSchedules = new Array(),
    singleSchedules = new Array();
var isPlaying = false,
    consecutiveSongsPlayed = 0,
    maxConsecutiveSongsPlayed = 10;

var db = new Knex({
    client: 'mysql',
    connection: bddParams,
    debug: false,
});

var tmpB = new Date();
tmpB.setSeconds(tmpB.getSeconds() + 20);

// INIT DES ALARMES EN BDD //
db.select('*').from('SingleAlarm').then(function(rows) {
    for (let i in rows) {
        console.log(rows[i].date.toLocaleString());
        for (var j in rows[i].date) {
            console.log(rows[i].date[j])
        }
        startSingleAlarm(rows[i]);
    }
})

db.select('*').from('RepetitiveAlarm').then(function(rows) {
    for (let i in rows) {
        startRepetitiveAlarm(rows[i]);
    }
    console.log("a la fin de l'init", repetitiveSchedules);
})

// AJOUT D'UNE ALARME EN BDD
function addAlarm(obj, table, callback) {
    db.from(table).insert(obj).then(function(row) {
        if (callback != null) {
            callback(row);
        }
    }).catch(function(err) {
        console.log(err);
    });

}

function updateAlarm(obj, table, callback) {
    db.from(table).update(obj).where('id', obj.id).then(function(row) {
        if (callback != null) {
            callback(row);
        }
    }).catch(function(err) {
        console.log(err);
    });
}

// LANCEMENT DES ALARMES
function startSingleAlarm(alarm) {
    singleSchedules[alarm.id] = schedule.scheduleJob(alarm.date, function() {
        console.log(alarm.name);
        play();
    });
}

function startRepetitiveAlarm(alarm) {
    let timeTable = alarm.time.split(':');
    var cronString = timeTable[2] + ' ' + timeTable[1] + ' ' + timeTable[0] + ' * * ';

    var days = {
        'monday': 1,
        'tuesday': 2,
        'wednesday': 3,
        'thusday': 4,
        'friday': 5,
        'saturday': 6,
        'sunday': 7
    };

    for (let d in days) {
        if (alarm[d]) {
            cronString += days[d] + ',';
        }
    }

    repetitiveSchedules[alarm.id] = schedule.scheduleJob(cronString.substring(0, cronString.length - 1), function() {
        console.log(alarm.name);
        play();
    });
}

// LECTURE DE LA MUSIQUE
function play() {
    isPlaying = true;
    if (consecutiveSongsPlayed > maxConsecutiveSongsPlayed) {
        consecutiveSongsPlayed = 0;
        isPlaying = false
        return;
    }
    fs.readdir(dir, function(err, files) {
        var file = dir + files[Math.floor(Math.random() * files.length)];
        console.log('debut de la lecture', file);
        fs.createReadStream(file)
            .pipe(new lame.Decoder())
            .on('format', function(format) {
                this.pipe(new Speaker(format));
            }).on('end', function() {
                console.log('fin de la lecture!!', file);
                consecutiveSongsPlayed++;
                play();
            });
    })
}

// CREATION DU SERVEUR EXPRESS
const app = express();
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

app.get('/', function(req, res) {
    res.render('index.ejs');
})

app.get('/singleAlarmsList', function(req, res) {
    db.select('*').from('SingleAlarm').then(function(rows) {
        res.status(200).render('partials/singleAlarmsList.ejs', {
            alarms: rows
        });
    })
})

app.get('/repetitiveAlarmsList', function(req, res) {
    db.select('*').from('RepetitiveAlarm').then(function(rows) {
        res.status(200).render('partials/repetitiveAlarmsList.ejs', {
            alarms: rows
        });
    })
})

app.post('/single', function(req, res) {
    var row = {
        'id': req.body['modal-id'].length < 1 ? undefined : req.body['modal-id'],
        'name': req.body['modal-name'],
        'date': req.body['modal-date'] + ' ' + req.body['modal-time']
    }
    console.log('/single', row);
    if (row.id) {
        updateAlarm(row, 'SingleAlarm', function() {
            singleSchedules[row.id].cancel();
            startSingleAlarm(row);
        })
    } else {
        addAlarm(row, 'SingleAlarm', function(id) {
            row.id = id;
            startSingleAlarm(row);
            res.status(200).send();
        });
    }
})

app.post('/repetitive', function(req, res) {
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
        updateAlarm(row, 'RepetitiveAlarm', function() {
            console.log(repetitiveSchedules);
            repetitiveSchedules[row.id].cancel();
            startRepetitiveAlarm(row);
        })
    } else {
        addAlarm(row, 'RepetitiveAlarm', function(id) {
            row.id = id;
            startRepetitiveAlarm(row);
            res.status(200).send();
        });
    }

    res.send('Hello World!')
})

app.post('/deleteSingle', function(req, res) {
    var idToDelete = req.body.id;
    console.log(idToDelete);
    db.from('SingleAlarm')
        .where('id', idToDelete)
        .del().then(function(index) {
            console.log(index);
            res.status(200).send("Miaw from delete");
        });
})

app.post('/deleteRepetitive', function(req, res) {
    var idToDelete = req.body.id;
    console.log(idToDelete);
    db.from('RepetitiveAlarm')
        .where('id', idToDelete)
        .del().then(function(index) {
            console.log(index);
            res.status(200).send("Miaw from delete");
        });
})

app.listen(expressPort, function() {
    console.log('Ready!!!')
})

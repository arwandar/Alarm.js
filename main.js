require("console-stamp")(console, {
    pattern: "dd/mm/yyyy HH:MM:ss.l"
});

// REQUIRE //
const schedule = require('node-schedule'),
    express = require('express'),
    Knex = require('knex'),
    bodyParser = require('body-parser'),
    urlencodedParser = bodyParser.urlencoded({
        extended: false
    }),
    request = require('request'),
    querystring = require('querystring'),
    SpotifyWebApi = require('spotify-web-api-node');

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

var spotParams = {
    'redirect_uri': 'http://localhost:' + expressPort + '/callback', // Your redirect uri
};

// VARIABLES GLOBALES //
var repetitiveSchedules = new Array(),
    singleSchedules = new Array();

var db = new Knex({
    client: 'mysql',
    connection: bddParams,
    debug: false,
});

var spotifyApi;

// INIT SPOTIFY
db.select('*').from('config').then(function(row) {
    spotParams.client_id = row[0].client_id;
    spotParams.client_secret = row[0].client_secret;
    spotParams.access_token = row[0].access_token;
    spotParams.refresh_token = row[0].refresh_token;

    spotifyApi = new SpotifyWebApi({
        clientId: spotParams.client_id,
        clientSecret: spotParams.client_secret,
        redirectUri: spotParams.redirect_uri
    });
    if (!spotParams.access_token) {
        console.log("MERCCI DE VOUS IDENTIFIER A CETTE URL http://arwandar.hopto.org:3002/login");
    }
}).catch(function(err) {
    console.log(err);
});

function getNewTokens(callback) {
    console.log('try to getNewTokens');
    var form = {
        grant_type: 'refresh_token',
        refresh_token: spotParams.refresh_token

    };
    postRequestNewTokens(form, callback);
}

function postRequestNewTokens(authOptions, callback) {
    var authOptions = {
        'form': authOptions,
        headers: {
            'Authorization': 'Basic ' + (new Buffer(spotParams.client_id + ':' + spotParams.client_secret).toString('base64'))
        },
        json: true,
        url: 'https://accounts.spotify.com/api/token'
    };
    request.post(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            console.log('body of getNewTokens', body);
            updateAccessToken(body.access_token);
            if (body.refresh_token) {
                updateRefreshToken(body.refresh_token);
            }
            spotifyApi.setAccessToken(spotParams.access_token);
            console.log('new tokens setted');
            if (callback != null) {
                callback();
            }
        }
    });
}

function updateAccessToken(obj) {
    spotParams.access_token = obj;
    db.from('config').update({
        'access_token': obj
    }).catch(function(err) {
        console.log(err);
    });
}

function updateRefreshToken(obj) {
    spotParams.refresh_token = obj;
    db.from('config').update({
        'refresh_token': obj
    }).catch(function(err) {
        console.log(err);
    });
}

// INIT DES ALARMES EN BDD //
db.select('*').from('SingleAlarm').then(function(rows) {
    for (let i in rows) {
        startSingleAlarm(rows[i]);
    }
    console.log('singleSchedules after init single alarm', singleSchedules);
})

db.select('*').from('RepetitiveAlarm').then(function(rows) {
    for (let i in rows) {
        startRepetitiveAlarm(rows[i]);
    }
    console.log('repetitiveSchedules after init repetitive alarm', repetitiveSchedules);
})

// LANCEMENT DES ALARMES
function startSingleAlarm(alarm) {
    console.log('start single alarm', alarm);
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

    console.log('start repetitive alarm', cronString.substring(0, cronString.length - 1));

    repetitiveSchedules[alarm.id] = schedule.scheduleJob(cronString.substring(0, cronString.length - 1), function() {
        console.log(alarm.name);
        play();
    });
}

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

// LECTURE DE LA MUSIQUE
function play() {
    console.log('beginning of the play function');
    getNewTokens(function() {
        spotifyApi.transferMyPlayback({
            'deviceIds': ['98bb0735e28656bac098d927d410c3138a4b5bca'],
            'play': true
        }).then(function(data) {
            console.log('play on the rasp!!');
        }, function(err) {
            console.error(err);
        });
    });
}

// CREATION DU SERVEUR EXPRESS
const app = express();
app.use(express.static('public'))
    .use(bodyParser.json())
    .use(bodyParser.urlencoded({
        extended: true
    }));

app.get('/', function(req, res) {
    res.render('index.ejs');
})

app.get('/test', function(req, res) {
    play();
    res.status(204).send();
})

app.get('/login', function(req, res) {
    // your application requests authorization
    var scope = 'playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private streaming user-follow-modify user-follow-read user-library-read user-library-modify user-read-private user-read-birthdate user-read-email user-top-read user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-recently-played';
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: spotParams.client_id,
            scope: scope,
            redirect_uri: spotParams.redirect_uri
        }));
});

app.get('/callback', function(req, res) {
    var form = {
        code: code,
        redirect_uri: spotParams.redirect_uri,
        grant_type: 'authorization_code'
    };
    postRequestNewTokens(form, function() {
        res.redirect('/');
    });
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
            console.log(row.id + " annulée dans singleSchedules");
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
            repetitiveSchedules[row.id].cancel();
            console.log(row.id + " annulée dans repetitiveSchedules");
            startRepetitiveAlarm(row);
            res.status(200).send();
        })
    } else {
        addAlarm(row, 'RepetitiveAlarm', function(id) {
            row.id = id[0];
            startRepetitiveAlarm(row);
            res.status(200).send();
        });
    }
})

app.delete('/singles/:id', function(req, res) {
    var idToDelete = req.params.id;
    console.log("suppression de la single", idToDelete);
    db.from('SingleAlarm')
        .where('id', idToDelete)
        .del().then(function(index) {
            console.log(index);
            res.status(204).send();
        });
})

app.delete('/repetitives/:id', function(req, res) {
    var idToDelete = req.params.id;
    console.log("suppression de la repetitive", idToDelete);
    db.from('RepetitiveAlarm')
        .where('id', idToDelete)
        .del().then(function(index) {
            res.status(204).send();
        });
})

app.listen(expressPort, function() {
    console.log('Server started')
})

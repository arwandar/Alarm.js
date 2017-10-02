require("console-stamp")(console, {
    pattern: "dd/mm/yyyy HH:MM:ss.l"
});

// REQUIRE //
const schedule = require('node-schedule'),
    express = require('express'),
    Knex = require('knex'),
    bodyParser = require('body-parser'), // Charge le middleware de gestion des paramètres
    urlencodedParser = bodyParser.urlencoded({
        extended: false
    }),
    request = require('request'), // "Request" library
    querystring = require('querystring'),
    cookieParser = require('cookie-parser'),
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
    'stateKey': 'France'
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
        console.log("MERCCI DE VOUS IDENTIFIER A CETTE URL http://arwandar.hopto.org:3003/login");
    } else {
        getNewTokens();
    }
}).catch(function(err) {
    console.log(err);
});

function getNewTokens() {
    var authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        headers: {
            'Authorization': 'Basic ' + (new Buffer(spotParams.client_id + ':' + spotParams.client_secret).toString('base64'))
        },
        form: {
            grant_type: 'refresh_token',
            refresh_token: spotParams.refresh_token
        },
        json: true
    };

    request.post(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            console.log(body);
            updateAccessToken(body.access_token);
            if (body.refresh_token) {
                updateRefreshToken(body.refresh_token);
            }

        }
    });

    spotifyApi.setAccessToken(spotParams.access_token);
}

function updateAccessToken(obj) {
    db.from('config').update({
        'access_token': obj
    }).catch(function(err) {
        console.log(err);
    });
}

function updateRefreshToken(obj) {
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
})

db.select('*').from('RepetitiveAlarm').then(function(rows) {
    for (let i in rows) {
        startRepetitiveAlarm(rows[i]);
    }
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
    getNewTokens();
    console.log('MIAWWWWWWWWWWWWWWWWWWWWWW');
    spotifyApi.transferMyPlayback({
        'deviceIds': ['98bb0735e28656bac098d927d410c3138a4b5bca'],
        'play': true
    }).then(function(data) {
        console.log(data.body);
    }, function(err) {
        console.error(err);
    });
}

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

// CREATION DU SERVEUR EXPRESS
const app = express();
app.use(express.static('public'))
    .use(bodyParser.json())
    .use(bodyParser.urlencoded({
        extended: true
    })).use(cookieParser());

app.get('/', function(req, res) {
    res.render('index.ejs');
})

app.get('/test', function(req, res) {
    play();
    res.status(200).send();
})

app.get('/login', function(req, res) {

    var state = generateRandomString(16);
    res.cookie(spotParams.stateKey, state);
    // your application requests authorization
    var scope = 'playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private streaming user-follow-modify user-follow-read user-library-read user-library-modify user-read-private user-read-birthdate user-read-email user-top-read user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-recently-played';
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: spotParams.client_id,
            scope: scope,
            redirect_uri: spotParams.redirect_uri,
            state: state
        }));
});

app.get('/callback', function(req, res) {

    // your application requests refresh and access tokens
    // after checking the state parameter

    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[spotParams.stateKey] : null;
    console.log(state);

    if (state === null || state !== storedState) {
        res.redirect('/#' +
            querystring.stringify({
                error: 'state_mismatch'
            }));
    } else {
        res.clearCookie(spotParams.stateKey);
        var authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            form: {
                code: code,
                redirect_uri: spotParams.redirect_uri,
                grant_type: 'authorization_code'
            },
            headers: {
                'Authorization': 'Basic ' + (new Buffer(spotParams.client_id + ':' + spotParams.client_secret).toString('base64'))
            },
            json: true
        };

        request.post(authOptions, function(error, response, body) {
            if (!error && response.statusCode === 200) {
                spotifyApi.setAccessToken(body.access_token);
                updateAccessToken(body.access_token);
                updateRefreshToken(body.refresh_token);
                res.status(200).send()
            } else {
                res.redirect('/#' +
                    querystring.stringify({
                        error: 'invalid_token'
                    }));
            }
        });
    }
});

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

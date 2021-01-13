const express = require('express')
const app = express()
var expressWs = require('express-ws')(app);
var bodyParser = require('body-parser')
const port = 3000

var sqlite3 = require('sqlite3').verbose()

// set up database for storing game info
var db = new sqlite3.Database(':memory:')
// export db
module.exports.db = db

// set up body parsing
app.use(bodyParser.json())

// set up routing
var gameManager = require('./game/game')
app.use('/games', gameManager)
var playerManager = require('./player/player').router
app.use('/player', playerManager)

app.listen(port, '0.0.0.0', () => {
    console.log(`LUDO backend listening at http://localhost:${port}`)
})
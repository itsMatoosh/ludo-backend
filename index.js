const express = require('express')
var cors = require('cors');
var bodyParser = require('body-parser')
const port = 3000

// sets up the server
async function setup() {
    // express setup
    const app = express()
    var expressWs = require('express-ws')(app)

    // set up database for storing game info
    const Database = require('sqlite-async')
    var db = await Database.open(':memory:')
    module.exports.db = db

    // set up body parsing
    app.use(bodyParser.json())

    // allow cross-domain access
    app.use(cors())

    // set up routing
    var gameManager = require('./game/game')
    app.use('/games', gameManager)

    app.listen(port, '0.0.0.0', () => {
        console.log(`LUDO backend listening at http://localhost:${port}`)
    })
}

setup()
var express = require('express')
var router = express.Router()

const db = require('../index').db

// initializes the game database
function initDB() {
    // prepare the nicknames database
    db.prepare(`CREATE TABLE IF NOT EXISTS nicknames (player INTEGER NOT NULL PRIMARY KEY, nickname varchar(15))`).run().finalize()
}

// gets a nickname from db
function getNickname(playerId, callback) {
    db.get('SELECT nickname FROM nicknames WHERE player = ?', [playerId], (err, row) => {
        if(err || row == undefined) {
            console.error('Error getting player nickname!', err)
            callback(undefined)
            return
        }
        callback(row['nickname'])
    })
}

// creates a nickname in db
function createNickname(playerId, nickname, callback) {
    db.run(`INSERT INTO nicknames (player, nickname) VALUES (?, ?)`, [playerId, nickname], (err) => {
        if(err) {
            console.error('Error updating player nickname!', err)
            callback(undefined)
            return
        }
        callback(nickname)
    })
}

// removes a nickname from db
function removeNickname(playerId) {
    db.run(`DELETE FROM nicknames WHERE player=?`, [playerId])
}

// get own nickname
router.get('/:id/nickname', (req, res) => {
    getNickname(req.params.id, (nickname) => {
        if(nickname == undefined) {
            res.status(404)
            res.send({'error': 'Nickname not set'})
            return
        }
        res.send({'nickname': nickname})
    })
})
// update own nickname
router.put('/:id/nickname', (req, res) => {
    if(req.body.nickname == undefined) {
        res.status(400)
        res.send('Invalid request')
        return
    }

    // update existing nickname
    db.run(`UPDATE nicknames SET nickname = ? WHERE player = ?`, [req.body.nickname, req.params.id], (err) => {
        if(err) {
            console.error('Error updating player nickname!', err)
            res.status(500)
            res.send({error: 'Database error'})
            return
        }
        res.send({})  
    })
})

// init nickname db
initDB()

module.exports.router = router
module.exports.removeNickname = removeNickname
module.exports.createNickname = createNickname
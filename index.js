const express = require('express')
const app = express()
const port = 3000

var message = {
    cock: 'balls',
    hello: 'world'
}


app.get('/', (req, res) => {
    res.send(message)
})

app.listen(port, () => {
    console.log(`LUDO backend listening at http://localhost:${port}`)
})
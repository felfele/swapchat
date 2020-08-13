const fs = require('fs')
const filename = 'dist/index.js'
const input = fs.readFileSync(filename).toString('utf8')
const output = input.replace(/\u00A0/g, '')
if (input !== output) {
    console.log('Fixed unicode non-breaking spaces')
    fs.writeFileSync(filename, output)
}

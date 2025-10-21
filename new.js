// Install Twilio first: npm install twilio

const accountSid = "ACf691596e7aa4f6b1e86b8928ca1d3464";
const authToken  = "cf534d9d88d6e5451d6809eefa27e65b";
const client = require('twilio')(accountSid, authToken);

client.messages.create({
    body: 'Hi',                     // Message text
    from: '+12293982958',            // Your Twilio trial number
    to: '+919891457097'              // Verified recipient number
})
.then(message => console.log('Message sent! SID:', message.sid))
.catch(error => console.error('Error sending SMS:', error));

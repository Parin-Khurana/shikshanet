// models/student.js
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
    // Note: not encrypted — stored as plain text (not recommended for production)
  }
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);

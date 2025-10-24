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
  },
  assignedTests: [{
    testName: String,
    subject: String,
    courseName: String,
    dueDate: String,
    fileUrl: String,
    fileName: String,
    teacherId: String,
    teacherName: String,
    assignedDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['assigned', 'completed', 'overdue'], default: 'assigned' }
  }]
}, { timestamps: true });

const Student = mongoose.model('Student', studentSchema);

module.exports = { Student, studentSchema };

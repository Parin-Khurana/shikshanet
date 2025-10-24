const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  sections: [
    {
      sectionName: String,
      students: [
        {
          name: String,
          phone: String,
          rollNo: String
        }
      ],
      courses: [
        {
          courseName: String,
          status: {
            type: String,
            enum: ['active', 'completed'], // restricts values
            default: 'active'
          },
          description: String
        }
      ]
    }
  ]
});

// 👇 The first argument defines the collection name as 'teachers'
module.exports = mongoose.model('Teacher', teacherSchema);

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
      ]
    }
  ]
});

// 👇 IMPORTANT: The first argument 'Teacher' defines the collection name as 'teachers'
module.exports = mongoose.model('Teacher', teacherSchema);

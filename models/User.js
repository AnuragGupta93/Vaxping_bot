const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const userSchema = new Schema({
  chatId: { type: String, required: true },
  pincode: { type: String, required: true },
});

// userSchema.index({ chatId: 1, pincode: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);

module.exports = User;

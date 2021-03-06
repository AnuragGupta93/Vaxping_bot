require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const mongoose = require('mongoose');
// Models
const User = require('./models/User');

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_TOKEN;
const url = process.env.MONGO_URI;
// Connect database
mongoose
  .connect(url, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
  })
  .then(() => {
    console.log('database connected!');
  })
  .catch((err) => console.log('database not connected!', err));

let bot;

// Bot configuration
if (process.env.NODE_ENV === 'production') {
  bot = new TelegramBot(token);
  bot.setWebHook(process.env.HEROKU_URL + bot.token);
} else {
  bot = new TelegramBot(token, { polling: true });
}

bot.onText(/\/start/, (msg) => {
  const text = `Welcome to the @Vaxping_bot, the vaccine reminder robot. The purpose of this bot is to notify the presence of Vaccines for the 18+ age group. Its functionalities includes:
\n => It checks for any vaccine slots available for 18+ age group in the next 4 weeks.
\n => It allows you to add your desired Pincode. 
\n => To add or update your Pincode, type "/add_pincode your_pincode" without quotes. Ex: /add_pincode 827001
\n => It allows only one Pincode for one user for better service.
\n => It checks for available vaccine slots in every 15 minutes.
\n => It only store your pincode and chatId.
\n => You are welcome to contribute to this project at https://github.com/AnuragGupta93/Vaxping_bot.
\n => Start the app now by entering your Pincode.`;
  bot.sendMessage(msg.chat.id, text);
});

bot.onText(/\/add_pincode (.+)/, async (msg, match) => {
  try {
    const chatId = msg.chat.id;
    const pincode = match[1];

    if (pincode.length !== 6 || !/^\d+$/.test(pincode)) {
      const errorText =
        'Error while reading pincode. Please make sure pincode is correct and try again.';
      bot.sendMessage(chatId, errorText);
      return;
    }

    const data = {
      chatId,
      pincode,
    };

    User.findOneAndUpdate({ chatId }, data, { upsert: true })
      .then(({ newData }) => {
        const saveText = `Updated Pincode-${pincode}`;
        bot.sendMessage(chatId, saveText);
      })
      .catch((err) => {
        const errorText =
          'Error occured while saving pincode. Please try later.';
        bot.sendMessage(chatId, errorText);
      });
  } catch (err) {
    const errorText = 'Error occured while saving pincode. Please try later.';
    bot.sendMessage(chatId, errorText);
  }
});

app.post('/' + bot.token, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

function dateFormat(date) {
  const curr = new Date(date);
  date.setDate(date.getDate() + 7);
  return curr.toISOString().slice(0, 10).split('-').reverse().join('-');
}

function getVaccinationDetails(pincode, day, chatId) {
  return axios
    .get(`${process.env.COWIN_API_URL}`, {
      params: {
        pincode,
        date: day,
      },
      headers: {
        accept: 'application/json',
        'Accept-Language': 'en_US',
      },
    })
    .then(({ data }) => {
      const vaccineAvailable = data.centers.find((el) => {
        return el.sessions.some(
          (child) => child.min_age_limit === 18 && child.available_capacity > 0
        ); // Set on 18 years for testing
      });

      console.log('vaccineAvailable', vaccineAvailable);

      if (vaccineAvailable) {
        const {
          name,
          block_name,
          district_name,
          state_name,
        } = vaccineAvailable;
        const dateAndTime = vaccineAvailable.sessions.find(
          (el) => el.min_age_limit === 18 && el.available_capacity > 0
        );
        const str = `Vaccine is available for you at ${name}, ${block_name}, ${district_name}, ${state_name}-${pincode}.Please check the details below for more information.\n\n${JSON.stringify(
          dateAndTime
        )}`;
        console.log(str);
        bot.sendMessage(chatId, str);
        return true;
      }
      return false;
    })
    .catch((err) => {
      console.log(err);
      return false;
    });
}

cron.schedule('*/15 * * * *', async () => {
  try {
    const allUsers = await User.find({});
    const date = new Date();
    date.setMinutes(date.getMinutes() + 330); // to UTC
    const firstWeekFormat = dateFormat(date);
    const secondWeekFormat = dateFormat(date);
    const thirdWeekFormat = dateFormat(date);
    const forthWeekFormat = dateFormat(date);
    for (const user of allUsers) {
      const { chatId, pincode } = user;

      const days = [
        firstWeekFormat,
        secondWeekFormat,
        thirdWeekFormat,
        forthWeekFormat,
      ];

      for (const day of days) {
        const found = await getVaccinationDetails(pincode, day, chatId);
        if (found) {
          break;
        }
      }
    }
    console.log(allUsers);
  } catch (err) {
    console.log(err);
  }
});

app.listen(process.env.PORT, () => {
  console.log('working on server');
});

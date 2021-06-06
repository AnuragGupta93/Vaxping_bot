require('dotenv').config();

// Edit this
const globalUsers = [
  {
    chatId: 1435767549,
    pincode: 827013,
  },
];

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const cors = require('cors');
const mongoose = require('mongoose');
// Models
// const User = require('./models/User');

const app = express();
app.use(express.json());
app.use(cors);

const token = process.env.TELEGRAM_TOKEN;
// const url = process.env.MONGO_URI;
// Connect database
// mongoose
//   .connect(url, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//     useFindAndModify: false,
//   })
//   .then(() => {
//     console.log('database connected!');
//   })
//   .catch((err) => console.log('database not connected!', err));

let bot;

// Bot configuration
if (process.env.NODE_ENV === 'production') {
  bot = new TelegramBot(token);
  bot.setWebHook(process.env.HEROKU_URL + bot.token);
} else {
  bot = new TelegramBot(token, { polling: true });
}

// start msg
bot.onText(/\/start/, (msg) => {
  const text = `Welcome to the @Vaxping_bot, the vaccine reminder robot. The purpose of this bot is to notify the presence of Vaccines for the 45+ age group. Its functionalities includes:
\n => New user registration has been closed as number of users exceeded the limit. Please contact developer if needed.
\n => It checks for any vaccine slots available for 45+ age group in the next 3 weeks.
\n => It allows you to add your desired Pincode. 
\n => To add or update your Pincode, type "/add_pincode your_pincode" without quotes. Ex: /add_pincode 827001
\n => It allows only one Pincode for one user for better service.
\n => It checks for available vaccine slots in every minute.
\n => It only store your pincode and chatId.
\n => Start the app now by entering your Pincode.`;
  bot.sendMessage(msg.chat.id, text);
});

// add pincode
bot.onText(/\/add_pincode (.+)/, async (msg, match) => {
  try {
    const chatId = msg.chat.id;
    const pincode = match[1];

    if (pincode.length !== 6 || !/^\d+$/.test(pincode)) {
      const errorText = 'Error while reading pincode. Please make sure pincode is correct and try again.';
      bot.sendMessage(chatId, errorText);
      return;
    }

    const data = {
      chatId,
      pincode,
    };

    console.log(
      `Add this data to globalUsers array on the top of index.js file:\n{chatId: ${chatId}, pincode: ${pincode}}`
    );
    const saveText = `Updated Pincode-${pincode}`;
    bot.sendMessage(chatId, saveText);
  } catch (err) {
    const errorText = 'Error occured while saving pincode. Please try later.';
    bot.sendMessage(chatId, errorText);
  }
});

// remove account
// bot.onText(/\/remove_account/, async (msg, match) => {
//   try {
//     const chatId = msg.chat.id;

//     User.findOneAndDelete({ chatId })
//       .then((newdata) => {
//         const saveText = `Account successfully removed`;
//         bot.sendMessage(chatId, saveText);
//       })
//       .catch((err) => {
//         console.log(err);
//         const errorText = 'Error occured. Please try later.';
//         bot.sendMessage(chatId, errorText);
//       });
//   } catch (err) {
//     const errorText = 'Error occured. Please try later.';
//     bot.sendMessage(chatId, errorText);
//   }
// });

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
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36',
      },
    })
    .then(({ data }) => {
      const vaccineAvailable = data.centers.find((el) => {
        return el.sessions.some((child) => child.min_age_limit === 45 && child.available_capacity > 0);
      });

      console.log('vaccineAvailable', vaccineAvailable);

      if (vaccineAvailable) {
        const { name, block_name, district_name, state_name } = vaccineAvailable;
        const dateAndTime = vaccineAvailable.sessions.find(
          (el) => el.min_age_limit === 45 && el.available_capacity > 0
        );
        const str = `Vaccine is available for you at ${name}, ${block_name}, ${district_name}, ${state_name}-${pincode}.Please check the details below for more information.\n\n${JSON.stringify(
          dateAndTime
        )}`;
        console.log(str);
        bot
          .sendMessage(chatId, str)
          .then(() => console.log(chatId))
          .catch((err) => console.log('error', chatId));
        return true;
      }
      return false;
    })
    .catch((err) => {
      console.log(err, chatId);
      return false;
    });
}

cron.schedule('*/30 * * * * *', async () => {
  try {
    const allUsers = globalUsers;
    const date = new Date();
    console.log(date.toLocaleString());
    date.setMinutes(date.getMinutes() + 330); // to UTC
    const firstWeekFormat = dateFormat(date);
    for (const user of allUsers) {
      const { chatId, pincode } = user;

      const days = [firstWeekFormat];

      for (const day of days) {
        const found = await getVaccinationDetails(pincode, day, chatId);
        if (found) {
          break;
        }
      }
    }
  } catch (err) {
    console.log(err);
  }
});

app.listen(8080, () => {
  console.log('working on server');
});

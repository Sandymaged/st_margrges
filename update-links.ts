import admin from 'firebase-admin';

admin.initializeApp();

const db = admin.firestore();

async function updateLinks() {
  const newLinks = {
    "شارة الطاهي": {
      "زهرات": "https://chat.whatsapp.com/E4ikeRfQgN07iJzdoL3iOW?mode=gi_t",
      "أشبال": "https://chat.whatsapp.com/IOfOZloWHDJCekdFgpy2hh?mode=gi_t",
      "مرشدات": "https://chat.whatsapp.com/D8Yyt6L3aoS96B9yl4OtJV?mode=gi_t",
      "كشاف": "https://chat.whatsapp.com/JMY5OoPrQPaGXI23hQfzKq?mode=gi_t",
      "رائدات": "https://chat.whatsapp.com/IGMbMGDsIjrGw9w3Cp3wCk?mode=gi_t",
      "متقدم": "https://chat.whatsapp.com/GsJzRhzjDdU7iqrq62ciQr?mode=gi_t"
    },
    "شارة مترجم": {
      "زهرات": "https://chat.whatsapp.com/HyuDVeWCwLlBaVFBZ3xwAo?mode=gi_t",
      "أشبال": "https://chat.whatsapp.com/LhAnaG414ZgKUoX6we725p?mode=gi_t",
      "مرشدات": "https://chat.whatsapp.com/Jw6Nxa4O6N9JvRAZxSAyTP?mode=gi_t",
      "كشاف": "https://chat.whatsapp.com/JHcVrzg8LPZ0l8zpaJXusp?mode=gi_t",
      "رائدات": "https://chat.whatsapp.com/DwwPXqbwwcpBz7xjpAyDHb?mode=gi_t",
      "متقدم": "https://chat.whatsapp.com/K2P7lsyweZEIqAmvTyowAm?mode=gi_t"
    },
    "شارة الصحفي": {
      "زهرات": "https://chat.whatsapp.com/H7WgunSttWoEuEO0LyqinM?mode=gi_t",
      "أشبال": "https://chat.whatsapp.com/BUjSOKAjrsI1lRrzW0mXUG?mode=gi_t",
      "مرشدات": "https://chat.whatsapp.com/HC2MKnkgKmcGdj2u6cbuNI?mode=gi_t",
      "كشاف": "https://chat.whatsapp.com/JUhFuKwlgBsC0mIblUSuHv?mode=gi_t",
      "رائدات": "https://chat.whatsapp.com/LO6TVfsmgxGGYHyORlK4gN?mode=gi_t",
      "متقدم": "https://chat.whatsapp.com/FrDDUU2Q8K35kroTs12Khr?mode=gi_t"
    },
    "شارة المطالع": {
      "زهرات": "https://chat.whatsapp.com/FxmyabuOxMp83wzNvw4YPW?mode=gi_t",
      "أشبال": "https://chat.whatsapp.com/LpZO8GpGjTf2TAKXZ7B6Xr?mode=gi_t",
      "مرشدات": "https://chat.whatsapp.com/DCLtkti4MnqLwO9R8WIGvk?mode=gi_t",
      "كشاف": "https://chat.whatsapp.com/DbgaTRsGyZt64Ymz47WEzE?mode=gi_t",
      "رائدات": "https://chat.whatsapp.com/BecKQpHNLjdDYECFkhkh4k?mode=gi_t",
      "متقدم": "https://chat.whatsapp.com/KToqxwJNdMpEuPPRJiYQlY?mode=gi_t"
    },
    "شارة المخيم": {
      "زهرات": "https://chat.whatsapp.com/IZUdIvXe7rMDZOi4MaaZ2M?mode=gi_t",
      "أشبال": "https://chat.whatsapp.com/IkFyCAGvCOJLs2bWbMBvoC?mode=gi_t",
      "مرشدات": "https://chat.whatsapp.com/J10vu13Jf2W95ZHAWximVI?mode=gi_t",
      "كشاف": "https://chat.whatsapp.com/KKxKlvEc3QVBZRgkOyokBA?mode=gi_t",
      "رائدات": "https://chat.whatsapp.com/DIoBhc3XSjAEhJfFlY9Xc7?mode=gi_t",
      "متقدم": "https://chat.whatsapp.com/LZn259GHzVKDUfganN8DPp?mode=gi_t"
    },
    "شارة رسام": {
      "زهرات": "https://chat.whatsapp.com/GpEBQjMwrCXIkxAQqap0oB?mode=gi_t",
      "أشبال": "https://chat.whatsapp.com/L1U4jriMfk1GMVm1GECvhv?mode=gi_t",
      "مرشدات": "https://chat.whatsapp.com/L3pcDuP8pMb3RCbDGFzU8h?mode=gi_t",
      "كشاف": "https://chat.whatsapp.com/EQOlEErjnt1AUJA1mkrL6p?mode=gi_t",
      "رائدات": "https://chat.whatsapp.com/EfgDJOBHNKOChrZSePcLNl?mode=gi_t",
      "متقدم": "https://chat.whatsapp.com/Ia5wF4RXhmaG5wrt7tpQi0?mode=gi_t"
    },
    "شارة فيديو (مونتاج)": {
      "زهرات": "https://chat.whatsapp.com/DaqgaoqZBKgKvaSGbow3Kj?mode=gi_t",
      "أشبال": "https://chat.whatsapp.com/BZUzE1ERQdQ05ypsKuuhQD?mode=gi_t",
      "مرشدات": "https://chat.whatsapp.com/K1iRL6DeDXlCYikkJMSW0n?mode=gi_t",
      "كشاف": "https://chat.whatsapp.com/KhiTNmJT1W8JNk3kyy1rl6?mode=gi_t",
      "رائدات": "https://chat.whatsapp.com/FhazUA1f10mDgcHiA8AbyY?mode=gi_t",
      "متقدم": "https://chat.whatsapp.com/JGTrMogcwxp48kaOenP8GH?mode=gi_t"
    }
  };

  const docRef = db.collection('settings').doc('badges');
  const doc = await docRef.get();
  const currentData = doc.data() || {};
  
  await docRef.update({
    groupLinks: {
      ...(currentData.groupLinks || {}),
      ...newLinks
    }
  });
  console.log('Successfully updated groupLinks');
}

updateLinks().catch(console.error);

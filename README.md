# TriaCare Health App 🫀🫘🟤

**Early Warning AI System for Heart, Liver & Kidney Disease**

Built with React Native + Expo | Powered by Claude AI (until custom ML model is ready)

---

## Quick Start

### 1. Install dependencies

```bash
cd TriaCare
npm install
```

### 2. Add your Claude API key

Open `src/services/claudeService.js` and replace:

```js
const CLAUDE_API_KEY = "YOUR_ANTHROPIC_API_KEY_HERE";
```

With your actual key from https://console.anthropic.com

### 3. Start the app

```bash
npx expo start
```

Scan the QR code with **Expo Go** (Android) or the Camera app (iOS).

---

## Project Structure

```
TriaCare/
├── App.js                          ← Navigation root
├── src/
│   ├── constants/
│   │   ├── colors.js               ← Purple medical theme
│   │   ├── symptoms.js             ← 15 warning signs (5 per organ)
│   │   └── education.js            ← Health education content
│   ├── services/
│   │   └── claudeService.js        ← Claude API + ML model placeholder
│   └── screens/
│       ├── HomeScreen.js           ← Dashboard with organ cards
│       ├── DetectionScreen.js      ← Symptom checker + photo upload
│       ├── ResultScreen.js         ← AI analysis + recommendations
│       ├── EducationScreen.js      ← Health education
│       └── HistoryScreen.js        ← Past screenings log
```

---

## Features

- ✅ Heart, Kidney & Liver symptom checking (5 signs each)
- ✅ Photo upload per symptom for visual AI analysis
- ✅ Claude AI-powered risk assessment & recommendations
- ✅ Health education with organ-specific content
- ✅ Screening history stored locally (private, on-device)
- ✅ Purple medical design system
- ✅ Dark/light compatible

---

## Replacing Claude with Your Trained ML Model

When your custom model is ready, replace the `analyzeSymptoms()` function
in `src/services/claudeService.js` with a call to your own inference endpoint:

```js
export async function analyzeSymptoms({
  organ,
  selectedSymptoms,
  imageBase64,
}) {
  const response = await fetch("https://your-ml-api.com/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organ,
      symptoms: selectedSymptoms,
      image: imageBase64,
    }),
  });
  const data = await response.json();
  return { success: true, data };
}
```

---

## Medical Disclaimer

TriaCare is a **screening tool only**. It does not diagnose disease.
Always consult a qualified healthcare professional for proper medical evaluation.

---

_Developed by GOMO Technologies Co. Ltd — Gulu City, Uganda_
*info@gomotechnologies.com | gomotechnologies.com*

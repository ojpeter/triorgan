import { registerRootComponent } from 'expo';

import App from './App';

// The single entry point. registerRootComponent calls
// AppRegistry.registerComponent('main', () => App) and sets up the environment
// for both Expo Go and native builds.
//
// App.js must NOT call this too — it previously did, giving the project two
// entry points, one of which (this file) was dead because package.json pointed
// "main" at App.js.
registerRootComponent(App);

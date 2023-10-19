import { createApp } from 'vue'


import App from '../popup/App.vue'

import 'spectre.css/dist/spectre.min.css'
import 'spectre.css/dist/spectre-icons.min.css'
import '@fortawesome/fontawesome-free/css/all.css'

const app = createApp(App)
app.mount('#popup')
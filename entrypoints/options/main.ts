import '@unocss/reset/tailwind.css'
import 'uno.css'
import { localizeDocument } from '~/utils/i18n'
import App from './App.vue'

localizeDocument()

const app = createApp(App)

app.mount('#app')

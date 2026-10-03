import '@unocss/reset/tailwind.css'
import 'uno.css'
import '~/assets/theme.css'
import { localizeDocument } from '~/utils/i18n'
import App from './App.vue'

localizeDocument()

createApp(App).mount('#app')

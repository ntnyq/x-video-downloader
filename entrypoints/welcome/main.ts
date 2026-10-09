import '~/assets/tailwind.css'
import { localizeDocument } from '~/utils/i18n'
import App from './App.vue'

localizeDocument()

createApp(App).mount('#app')

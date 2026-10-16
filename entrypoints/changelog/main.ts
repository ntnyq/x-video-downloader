import '~/assets/tailwind.css'
import { i18n } from '#i18n'
import { localizeDocument } from '~/utils/i18n'
import App from './App.vue'

localizeDocument()
document.title = `${i18n.t('changelog.title')} · ${i18n.t('extension.name')}`

createApp(App).mount('#app')

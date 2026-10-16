import '~/assets/tailwind.css'
import { i18n } from '#i18n'
import { localizeDocument } from '~/utils/i18n'
import App from './App.vue'

localizeDocument()
document.title = `${i18n.t('changelogTitle')} · ${i18n.t('extensionName')}`

createApp(App).mount('#app')

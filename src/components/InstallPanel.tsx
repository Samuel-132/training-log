import { CheckCircle2, Share, Smartphone, WifiOff } from 'lucide-react'
import type { OfflineStatus } from '../usePwa'

const statusText: Record<OfflineStatus, string> = {
  ready: 'L’app est prête à fonctionner hors ligne sur cet appareil.',
  preparing: 'Préparation du mode hors ligne… Gardez cette page ouverte avec une connexion.',
  unavailable:
    'Le mode hors ligne n’a pas pu être préparé. Rouvrez l’app avec une connexion et vérifiez que le stockage est autorisé.',
  unsupported:
    'Ce navigateur ne permet pas de préparer le mode hors ligne. Ouvrez l’adresse de l’app dans Safari sur votre iPhone.',
  development: 'Le mode hors ligne sera disponible dans la version publiée.',
}

export function InstallPanel({ status }: { status: OfflineStatus }) {
  return (
    <section className="panel settings-panel install-panel">
      <span className="settings-icon">
        <Smartphone size={26} />
      </span>
      <h2>Installer sur mon iPhone</h2>
      <p>Gardez votre carnet à portée de main, directement sur l’écran d’accueil.</p>
      <ol className="install-steps">
        <li>
          Ouvrez cette adresse dans <strong>Safari</strong>.
        </li>
        <li>
          Ouvrez le menu de{' '}
          <strong>
            partage <Share size={13} />
          </strong>
          , puis choisissez <strong>Sur l’écran d’accueil</strong>.
        </li>
        <li>
          Si l’option est proposée, activez <strong>Ouvrir comme app web</strong>, puis touchez{' '}
          <strong>Ajouter</strong>.
        </li>
        <li>
          Ouvrez l’icône Training Log et attendez <strong>Prêt hors ligne</strong> avant de partir à
          la salle.
        </li>
      </ol>
      <div className={`install-status ${status === 'ready' ? 'is-ready' : ''}`} role="status">
        {status === 'ready' ? <CheckCircle2 size={18} /> : <WifiOff size={18} />}
        <span>{statusText[status]}</span>
      </div>
      <p className="input-hint">
        Installez l’app avant de commencer votre carnet. Si nécessaire, utilisez l’export/import
        pour transférer des séances déjà saisies dans Safari.
      </p>
    </section>
  )
}

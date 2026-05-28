import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Award,
  Building2,
  Mail,
  MapPin,
  Phone,
  Clock,
  ShieldAlert,
  Lock,
} from 'lucide-react';
import { getSession } from '../lib/auth';

type Licence = {
  num: number;
  autorite: string;
  type: string;
  reference: string;
  date: string;
  status?: 'agree' | 'en_cours';
};

const LICENCES: Licence[] = [
  {
    num: 1,
    autorite: 'Ministère de la Jeunesse, Sports et Loisirs',
    type: "Autorisation d'exploitation des Jeux de Hasard Permanent",
    reference: 'Arrêté Ministériel N°047/CAB/MIN/JSL/2016',
    date: '09 décembre 2016',
    status: 'agree',
  },
  {
    num: 2,
    autorite: 'Direction des Loisirs — Secrétariat Général aux Sports et Loisirs',
    type: 'Homologation du Règlement de Jeux de Hasard Permanent',
    reference: 'Procès-verbal N°005/2017',
    date: '27 avril 2017',
    status: 'agree',
  },
  {
    num: 3,
    autorite: 'ARPTC — Autorité de Régulation de la Poste et des Télécommunications du Congo',
    type: 'Agrégateur et Intégrateur des applications (SMS & USSD)',
    reference: 'ASVA-ARPTC n°0573/008/Mars/2023',
    date: '22 mai 2023',
    status: 'agree',
  },
  {
    num: 4,
    autorite: 'ARPTC',
    type: 'Service de Contenus (SMS & USSD)',
    reference: 'ASVA-ARPTC n°0574/009/Mars/2023',
    date: '22 mai 2023',
    status: 'agree',
  },
  {
    num: 5,
    autorite: 'Ministère des Finances — Cabinet du Ministre',
    type: "Agrément d'exploitation des jeux d'argent en RDC",
    reference: 'N°1024/CAB/MIN/FINANCES/JUR/LKL/2023',
    date: '12 février 2023',
    status: 'agree',
  },
];

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 py-1.5 border-b border-zinc-800/60 last:border-b-0">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="text-sm text-zinc-100">{value}</div>
    </div>
  );
}

function LicenceCard({ l }: { l: Licence }) {
  const isAgree = l.status === 'agree';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-display text-sm text-gold">
            {l.num}
          </div>
          <div className="font-display text-lg text-gold tracking-wider">LICENCE {l.num}</div>
        </div>
        {isAgree ? (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded-full bg-gold text-black">
            <Award className="w-3 h-3" /> AGRÉÉ
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-semibold px-2 py-1 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-300">
            EN COURS DE FINALISATION
          </span>
        )}
      </div>
      <div className="mt-3">
        <InfoRow label="Autorité" value={l.autorite} />
        <InfoRow label="Type" value={l.type} />
        <InfoRow label="Référence" value={<span className="font-mono text-xs break-all text-white">{l.reference}</span>} />
        <InfoRow label="Date" value={l.date} />
      </div>
    </motion.div>
  );
}

export default function LegalScreen() {
  const nav = useNavigate();
  const session = getSession();

  return (
    <div className="min-h-screen p-4 pb-28">
      <header className="flex items-center gap-3 py-2">
        <button
          onClick={() => nav(-1)}
          className="w-11 h-11 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-gold"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <img
          src="/images/okapi.PNG"
          alt="Congo Gaming"
          className="h-10 w-auto object-contain cursor-pointer"
          onClick={() => nav(session ? '/' : '/splash')}
        />
        <h1 className="font-display text-2xl text-gold tracking-wider ml-auto">LÉGAL</h1>
      </header>

      {/* SECTION 1 — IDENTITÉ */}
      <section className="mt-4">
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="w-4 h-4 text-gold" />
          <h2 className="font-display text-2xl text-gold tracking-wider">
            INFORMATIONS LÉGALES
          </h2>
        </div>
        <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
          <InfoRow label="Raison sociale" value="CONGO GAMING LIMITED SARL" />
          <InfoRow label="Sigle" value="CGL SARL" />
          <InfoRow label="Forme juridique" value="Société à Responsabilité Limitée (SARL)" />
          <InfoRow label="RCCM" value={<span className="font-mono">CD/KIN/RCCM/16-B-09723</span>} />
          <InfoRow label="Id. Nationale" value={<span className="font-mono">01-9-N15024X</span>} />
          <InfoRow label="N° Impôt (DGI)" value={<span className="font-mono">A1621850T</span>} />
          <InfoRow label="INSS" value={<span className="font-mono">010109351A1</span>} />
          <InfoRow label="INPP" value={<span className="font-mono">N° DG/DF/DR/GU/17442/2016</span>} />
          <InfoRow
            label="Siège social"
            value={
              <>
                38, Avenue Ouganda, Quartier Clinique,
                <br />
                Commune de Ngaliema, Kinshasa,
                <br />
                République Démocratique du Congo
              </>
            }
          />
          <InfoRow
            label="Téléphone"
            value={
              <>
                <a href="tel:+243997174834" className="text-congogreen hover:underline">
                  +243 997 174 834
                </a>
                {' / '}
                <a href="tel:+243894712727" className="text-congogreen hover:underline">
                  +243 894 712 727
                </a>
              </>
            }
          />
          <InfoRow
            label="Email"
            value={
              <a
                href="mailto:congo.gaming.rdc@gmail.com"
                className="text-congogreen hover:underline break-all"
              >
                congo.gaming.rdc@gmail.com
              </a>
            }
          />
          <InfoRow label="Responsable" value="Franck TCHENDA LUBINGA" />
        </div>
      </section>

      {/* SECTION 2 — AGRÉMENTS */}
      <section className="mt-6">
        <div className="flex items-center gap-2 mb-2">
          <Award className="w-4 h-4 text-gold" />
          <h2 className="font-display text-2xl text-gold tracking-wider">
            AGRÉMENTS &amp; LICENCES
          </h2>
        </div>
        <div className="space-y-3">
          {LICENCES.map((l) => (
            <LicenceCard key={l.num} l={l} />
          ))}
        </div>
      </section>

      {/* SECTION 3 — JEU RESPONSABLE */}
      <section className="mt-6">
        <div className="rounded-2xl bg-gold/5 border-2 border-gold p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-5 h-5 text-gold" />
            <h2 className="font-display text-2xl text-gold tracking-wider">
              ⚠️ JEU RESPONSABLE
            </h2>
          </div>
          <p className="text-sm text-zinc-100 leading-relaxed">
            Congo Gaming s'engage à promouvoir un jeu responsable. Les jeux d'argent
            sont réservés aux personnes majeures (18 ans et plus).
          </p>
          <p className="text-sm text-zinc-100 leading-relaxed mt-2">
            Conformément au Procès-verbal N°005/2017 d'homologation, le mineur est
            expressément protégé et exclu de la participation aux jeux.
          </p>
          <p className="text-sm text-zinc-100 leading-relaxed mt-2">
            Si vous pensez avoir un problème avec le jeu, contactez-nous immédiatement à{' '}
            <a
              href="mailto:congo.gaming.rdc@gmail.com"
              className="text-gold underline break-all"
            >
              congo.gaming.rdc@gmail.com
            </a>
          </p>
        </div>
      </section>

      {/* SECTION 4 — DONNÉES PERSONNELLES */}
      <section className="mt-6">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-4 h-4 text-gold" />
          <h2 className="font-display text-2xl text-gold tracking-wider">
            DONNÉES PERSONNELLES
          </h2>
        </div>
        <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4">
          <p className="text-sm text-zinc-100 leading-relaxed">
            Les données collectées (numéro de téléphone, transactions) sont utilisées
            exclusivement dans le cadre de la gestion de votre compte et du respect de
            nos obligations légales en République Démocratique du Congo.
          </p>
          <p className="text-sm text-zinc-100 leading-relaxed mt-2">
            Aucune donnée n'est transmise à des tiers sans votre consentement.
          </p>
          <p className="text-sm text-zinc-100 leading-relaxed mt-2">
            Pour toute demande relative à vos données :{' '}
            <a
              href="mailto:congo.gaming.rdc@gmail.com"
              className="text-congogreen underline break-all"
            >
              congo.gaming.rdc@gmail.com
            </a>
          </p>
        </div>
      </section>

      {/* SECTION 5 — CONTACT */}
      <section className="mt-6">
        <div className="flex items-center gap-2 mb-2">
          <Phone className="w-4 h-4 text-gold" />
          <h2 className="font-display text-2xl text-gold tracking-wider">CONTACT</h2>
        </div>
        <div className="rounded-2xl bg-zinc-900/70 border border-zinc-800 p-4 space-y-3">
          <a
            href="mailto:congo.gaming.rdc@gmail.com"
            className="flex items-center gap-3 group"
          >
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-gold shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Email</div>
              <div className="text-sm text-congogreen group-hover:underline break-all">
                congo.gaming.rdc@gmail.com
              </div>
            </div>
          </a>

          <a href="tel:+243997174834" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-gold shrink-0">
              <Phone className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Téléphone</div>
              <div className="text-sm text-congogreen group-hover:underline">+243 997 174 834</div>
            </div>
          </a>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-gold shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Adresse</div>
              <div className="text-sm text-zinc-100">
                38, Avenue Ouganda, Ngaliema, Kinshasa, RDC
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-gold shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Heures</div>
              <div className="text-sm text-zinc-100">
                Lundi — Vendredi, 8h00 — 17h00 (heure de Kinshasa)
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="mt-8 pt-4 border-t border-zinc-800 text-center">
        <div className="text-[11px] text-zinc-500 leading-relaxed">
          © 2024 Congo Gaming Limited SARL — Tous droits réservés
          <br />
          Exploitant agréé de jeux de hasard en RDC
        </div>
      </footer>
    </div>
  );
}

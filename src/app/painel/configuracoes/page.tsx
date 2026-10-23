import type { Metadata } from 'next';
import { getOrigin, requireShop } from '@/lib/auth';
import { fromMin, TIMEZONES, weekdayShort } from '@/lib/time';
import { maskPhone } from '@/lib/phone';
import { CopyButton } from '@/components/copy-button';
import { terms } from '@/lib/themes';
import { saveSettings } from '../actions';

export const metadata: Metadata = { title: 'Configurações' };

const ORDER = [1, 2, 3, 4, 5, 6, 0];

function hours(from: number, to: number) {
  const out: React.ReactNode[] = [];
  for (let m = from; m <= to; m += 30) out.push(<option key={m} value={fromMin(m)}>{fromMin(m)}</option>);
  return out;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { shop } = await requireShop();
  const sp = await searchParams;
  const origin = await getOrigin();
  const t = terms(shop.niche);
  const link = `${origin}/${shop.slug}`;

  return (
    <>
      {sp.ok ? <p className="flash ok" role="status">{sp.ok}</p> : null}
      {sp.err ? <p className="flash bad" role="alert">{sp.err}</p> : null}

      <section className="card">
        <h3>Seu link de agendamento</h3>
        <p className="hint">Coloque no Instagram, no WhatsApp e no Google Meu Negócio. O cliente agenda sem baixar nada.</p>
        <div className="linkbox"><code>{link}</code><CopyButton text={link} /></div>
      </section>

      <form action={saveSettings} className="card stack" style={{ gap: 16 }}>
        <h3>Dados e horários</h3>
        <div className="fields">
          <div className="field"><label htmlFor="name">Nome {t.of} {t.place}</label><input id="name" name="name" defaultValue={shop.name} maxLength={80} required /></div>
          <div className="field"><label htmlFor="phone">WhatsApp {t.of} {t.place}</label><input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={shop.phone ? maskPhone(shop.phone) : ''} placeholder="(62) 91234-5678" /></div>
        </div>
        <div className="fields">
          <div className="field"><label htmlFor="open">Abre às</label><select id="open" name="open" defaultValue={shop.open_time.slice(0, 5)}>{hours(300, 1200)}</select></div>
          <div className="field"><label htmlFor="close">Fecha às</label><select id="close" name="close" defaultValue={shop.close_time.slice(0, 5)}>{hours(360, 1380)}</select></div>
        </div>
        <div>
          <span className="lbl">Dias abertos</span>
          <div className="chips" role="group" aria-label="Dias abertos">
            {ORDER.map((d) => (
              <label className="chip" key={d}>
                <input type="checkbox" name="days" value={d} defaultChecked={shop.open_days.includes(d)} />
                <span>{weekdayShort(d)}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="fields">
          <div className="field">
            <label htmlFor="slot">Intervalo entre horários</label>
            <select id="slot" name="slot" defaultValue={shop.slot_minutes}>
              <option value={15}>15 minutos</option>
              <option value={30}>30 minutos</option>
              <option value={60}>1 hora</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="loyalty">Brinde a cada quantos atendimentos</label>
            <input id="loyalty" name="loyalty" type="number" min={2} max={50} defaultValue={shop.loyalty_target} required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="timezone">Fuso horário</label>
          <select id="timezone" name="timezone" defaultValue={shop.timezone}>
            {TIMEZONES.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
          </select>
        </div>

        <h3>Regras da agenda online</h3>
        <div className="fields">
          <div className="field">
            <label htmlFor="window">Cliente pode agendar até</label>
            <select id="window" name="window" defaultValue={shop.booking_window_days}>
              {[7, 14, 21, 30, 45, 60].map((d) => <option key={d} value={d}>{d} dias à frente</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="lead">Antecedência mínima</label>
            <select id="lead" name="lead" defaultValue={shop.min_lead_min}>
              {[[0, 'Nenhuma'], [15, '15 minutos'], [30, '30 minutos'], [60, '1 hora'], [120, '2 horas'], [240, '4 horas'], [720, '12 horas'], [1440, '1 dia']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="cancel">Cliente remarca ou cancela pelo link até</label>
            <select id="cancel" name="cancel" defaultValue={shop.cancel_hours}>
              {[[0, 'A qualquer momento antes'], [1, '1 hora antes'], [2, '2 horas antes'], [4, '4 horas antes'], [12, '12 horas antes'], [24, '1 dia antes'], [48, '2 dias antes']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        <h3>WhatsApp</h3>
        <label className="check">
          <input type="checkbox" name="whatsapp" defaultChecked={shop.whatsapp_enabled} />
          <span>Enviar confirmação e lembretes automáticos no WhatsApp dos clientes que aceitarem.</span>
        </label>
        <label className="check">
          <input type="checkbox" name="day_before" defaultChecked={shop.reminder_day_before} />
          <span>Lembrete na véspera (24 horas antes), com o link para confirmar presença, remarcar ou cancelar.</span>
        </label>
        <div className="field" style={{ maxWidth: 360 }}>
          <label htmlFor="reminder_lead">Lembrete no dia</label>
          <select id="reminder_lead" name="reminder_lead" defaultValue={shop.reminder_lead_min}>
            {[[0, 'Não enviar'], [30, '30 minutos antes'], [60, '1 hora antes'], [120, '2 horas antes'], [180, '3 horas antes']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <p className="note">Cada mensagem é cobrada pela Meta. As mudanças nos lembretes valem para os próximos agendamentos.</p>
        <div><button className="btn primary">Salvar</button></div>
        <p className="note">O endereço do link ({shop.slug}) não muda depois de criado, para não quebrar links já divulgados. Para trocar, fale com o suporte.</p>
      </form>
    </>
  );
}

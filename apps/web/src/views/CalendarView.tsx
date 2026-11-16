import { CalendarDays } from 'lucide-react';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
const EVENTS: Record<number, { time: string; title: string; kind: 'meet' | 'arena' }[]> = {
  0: [{ time: '09:00', title: 'Reunión que pudo ser un correo', kind: 'meet' }],
  1: [{ time: '11:30', title: 'Sincronización con el Consejo Real', kind: 'meet' }],
  2: [{ time: '13:00', title: 'Duelo de mecanografía del almuerzo', kind: 'arena' }],
  3: [{ time: '16:00', title: 'Revisión trimestral del dragón', kind: 'meet' }],
  4: [{ time: '17:00', title: 'Torneo semanal de la oficina', kind: 'arena' }],
};

export function CalendarView() {
  return (
    <div className="page calendar">
      <header className="page-head">
        <h2>
          <CalendarDays size={22} /> Calendario <span className="pill">Pronto</span>
        </h2>
        <p className="muted">Aquí vivirán los torneos semanales y los duelos programados. Por ahora, una vista previa.</p>
      </header>
      <div className="cal-grid">
        {DAYS.map((d, i) => (
          <div key={d} className="cal-day">
            <div className="cal-day-head">{d}</div>
            {(EVENTS[i] ?? []).map((e) => (
              <div key={e.title} className={`cal-event ${e.kind}`}>
                <small>{e.time}</small>
                <span>{e.title}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

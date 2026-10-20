import { useId, useState } from 'react';
import { ChartColumn, Table } from 'lucide-react';
import { cx } from '../../lib/cx';
import Button from '../ui/Button';
import styles from './ActivityChart.module.css';

// Days from /stats are UTC dates ("2026-10-20"), so format them in UTC
const formatDay = (isoDate, options) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', ...options });

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const activities = (n) => `${n} ${n === 1 ? 'activity' : 'activities'}`;

// Round the axis maximum up to a clean number (4, 10, 20, 50 ...)
function niceCeil(value) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

// Activity per day as one series of columns. Hover or arrow keys show each
// day's value; the same numbers are always available as a table.
// variant: compact (dashboard, no axes) | full (Progress page)
function ActivityChart({ days, variant = 'compact', title = 'Activity over the last 14 days' }) {
  const [active, setActive] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const captionId = useId();
  const full = variant === 'full';
  const lastIndex = days.length - 1;

  const max = Math.max(0, ...days.map((d) => d.count));
  const scaleMax = niceCeil(max);
  const ticks = [0, scaleMax / 2, scaleMax];
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;
  const labelIndexes = new Set([0, 1, 2, 3].map((k) => Math.round((k * lastIndex) / 3)));
  const activeDay = active == null ? null : days[active];

  // The API's days are UTC dates, so the newest one isn't always the
  // viewer's local "today"; label every day by its date
  const dayLabel = (index) => formatDay(days[index].date, { month: 'short', day: 'numeric' });

  const onKeyDown = (event) => {
    const moves = {
      ArrowRight: (i) => (i == null ? lastIndex : Math.min(lastIndex, i + 1)),
      ArrowLeft: (i) => (i == null ? lastIndex : Math.max(0, i - 1)),
      Home: () => 0,
      End: () => lastIndex,
    };
    if (moves[event.key]) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === 'Escape') {
      setActive(null);
    }
  };

  const table = (
    <table className={full ? styles.table : 'sr-only'}>
      <caption className="sr-only">{title}</caption>
      <thead>
        <tr>
          <th scope="col">Day (UTC)</th>
          <th scope="col">Activities</th>
        </tr>
      </thead>
      <tbody>
        {days.map((day) => (
          <tr key={day.date}>
            <td>{formatDay(day.date, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
            <td className={styles.numeric}>{day.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <figure className={cx(styles.figure, styles[variant])}>
      {full && (
        <div className={styles.toolbar}>
          <Button
            variant="ghost"
            size="sm"
            icon={showTable ? ChartColumn : Table}
            aria-pressed={showTable}
            onClick={() => setShowTable((v) => !v)}
          >
            {showTable ? 'Show chart' : 'Show table'}
          </Button>
        </div>
      )}

      {full && showTable ? (
        table
      ) : (
        <>
          <div className={styles.chart}>
            {full && (
              <div className={styles.yAxis} aria-hidden="true">
                {ticks.map((tick) => (
                  <span key={tick} style={{ bottom: `${(tick / scaleMax) * 100}%` }}>
                    {tick}
                  </span>
                ))}
              </div>
            )}
            <div
              className={styles.plot}
              role="group"
              tabIndex={0}
              aria-label={`${title}. Use the left and right arrow keys to read each day.`}
              aria-describedby={captionId}
              onKeyDown={onKeyDown}
              onFocus={() => setActive((i) => i ?? lastIndex)}
              onBlur={() => setActive(null)}
              onPointerLeave={() => setActive(null)}
            >
              {full &&
                ticks.slice(1).map((tick) => (
                  <span key={tick} className={styles.gridline} style={{ bottom: `${(tick / scaleMax) * 100}%` }} aria-hidden="true" />
                ))}
              {days.map((day, index) => (
                <div
                  key={day.date}
                  className={cx(styles.slot, active === index && styles.activeSlot)}
                  onPointerEnter={() => setActive(index)}
                  aria-hidden="true"
                >
                  {day.count > 0 && (
                    <span
                      className={styles.bar}
                      style={{ height: `${(day.count / scaleMax) * 100}%`, '--index': index }}
                    />
                  )}
                </div>
              ))}
              {activeDay && (
                <div
                  className={cx(
                    styles.tooltip,
                    active <= 1 && styles.alignStart,
                    active >= lastIndex - 1 && styles.alignEnd
                  )}
                  style={{ left: `${((active + 0.5) / days.length) * 100}%` }}
                  role="status"
                >
                  <strong>{activities(activeDay.count)}</strong>
                  <span>{formatDay(activeDay.date, { weekday: 'short', month: 'short', day: 'numeric' })} (UTC)</span>
                </div>
              )}
            </div>
          </div>
          {full && (
            <div className={styles.xAxis} aria-hidden="true">
              {days.map((day, index) => (
                <span key={day.date}>{labelIndexes.has(index) ? dayLabel(index) : ''}</span>
              ))}
            </div>
          )}
          {!full && table}
        </>
      )}

      <figcaption id={captionId} className={full ? styles.caption : 'sr-only'}>
        {activities(total)} on {plural(activeDays, 'day')} in the last {days.length} days. Days are in UTC.
      </figcaption>
    </figure>
  );
}

export default ActivityChart;

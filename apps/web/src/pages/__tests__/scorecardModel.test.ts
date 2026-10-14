import { describe, expect, it } from 'vitest';

import { SCORECARD_REPORT } from './scorecardTestData';
import {
  drilldownHref,
  formatDelta,
  formatMetricValue,
  parseTab,
  parseWindow,
  sparklinePoints,
  unknownText,
} from '../scorecard/scorecardModel';

describe('scorecardModel', () => {
  it('parses the URL controls with narrow defaults', () => {
    expect(parseWindow(new URLSearchParams('window=7d'))).toBe('7d');
    expect(parseWindow(new URLSearchParams('window=14d'))).toBe('30d');
    expect(parseTab(new URLSearchParams('tab=outcomes'))).toBe('outcomes');
    expect(parseTab(new URLSearchParams('tab=volume'))).toBe('scorecard');
  });

  it('renders unknown metrics as source needs, not zeros', () => {
    const raw = SCORECARD_REPORT.metrics.raw_net_lines_per_day;
    expect(formatMetricValue(raw.value, 'count')).toBe('—');
    expect(unknownText(raw)).toBe(
      'Not measured yet — needs pull request diff statistics'
    );
  });

  it('formats known values, deltas and sparse sparklines', () => {
    expect(formatMetricValue(86_400, 'duration')).toBe('1 d');
    expect(formatMetricValue(42.25, 'money')).toBe('$42.25');
    expect(formatMetricValue(3.2, 'percent')).toBe('3.2%');
    expect(formatDelta(2.4, 2.1, 'count')).toBe('+0.3 vs previous');
    expect(sparklinePoints([1, null, 2])).toBe('0,28 100,4');
  });

  it('routes row links to the backing surfaces', () => {
    expect(drilldownHref('wip_by_station', '7d', 'acme', 'acme/widgets')).toBe(
      '/flow?metric=wip_by_station&window=7d&family=acme&repo=acme%2Fwidgets'
    );
    expect(drilldownHref('false_done_rate', '7d', 'acme', '')).toBe(
      '/work?metric=false_done_rate&window=7d&family=acme'
    );
    expect(drilldownHref('time_to_restore', '7d', '', '')).toBe(
      '/activity?metric=time_to_restore&window=7d'
    );
  });
});

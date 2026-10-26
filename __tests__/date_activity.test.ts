import { formatRelativeActivity } from '../src/utils/date';

describe('formatRelativeActivity', () => {
  const RealDate = Date;

  afterEach(() => {
    global.Date = RealDate;
  });

  it('correctly classifies yesterday afternoon even when elapsed time is under 24 hours', () => {
    // Current time: 2026-10-26 15:27:00 (3:27 PM)
    const mockNow = new RealDate('2026-10-26T15:27:00.000');
    // Event time: 2026-10-25 15:37:00 (3:37 PM yesterday, ~23h 50m ago)
    const yesterdayEvent = new RealDate('2026-10-25T15:37:00.000');

    // Mock Date.now and new Date()
    global.Date = class extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(mockNow.getTime());
        } else {
          super(args[0], ...(args.slice(1) as []));
        }
      }
      static now() {
        return mockNow.getTime();
      }
    } as any;

    const formattedHi = formatRelativeActivity(yesterdayEvent.toISOString(), 'hi');
    const formattedEn = formatRelativeActivity(yesterdayEvent.toISOString(), 'en');

    // It MUST be 'कल', NEVER 'आज'
    expect(formattedHi).toContain('कल');
    expect(formattedHi).not.toContain('आज');
    expect(formattedEn).toContain('Yesterday');
    expect(formattedEn).not.toContain('Today');
  });

  it('correctly classifies today earlier events', () => {
    // Current time: 2026-10-26 18:00:00 (6:00 PM)
    const mockNow = new RealDate('2026-10-26T18:00:00.000');
    // Event time: 2026-10-26 15:37:00 (3:37 PM today)
    const todayEvent = new RealDate('2026-10-26T15:37:00.000');

    global.Date = class extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(mockNow.getTime());
        } else {
          super(args[0], ...(args.slice(1) as []));
        }
      }
      static now() {
        return mockNow.getTime();
      }
    } as any;

    const formattedHi = formatRelativeActivity(todayEvent.toISOString(), 'hi');
    const formattedEn = formatRelativeActivity(todayEvent.toISOString(), 'en');

    expect(formattedHi).toContain('आज');
    expect(formattedEn).toContain('Today');
  });

  it('formats recent events within minutes as X मिनट पहले', () => {
    const mockNow = new RealDate('2026-10-26T15:27:00.000');
    const fiveMinAgo = new RealDate(mockNow.getTime() - 5 * 60 * 1000);

    global.Date = class extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(mockNow.getTime());
        } else {
          super(args[0], ...(args.slice(1) as []));
        }
      }
      static now() {
        return mockNow.getTime();
      }
    } as any;

    expect(formatRelativeActivity(fiveMinAgo.toISOString(), 'hi')).toBe('5 मिनट पहले');
    expect(formatRelativeActivity(fiveMinAgo.toISOString(), 'en')).toBe('5m ago');
  });

  it('formats very recent or slightly clock-skewed events as अभी-अभी', () => {
    const mockNow = new RealDate('2026-10-26T15:27:00.000');
    const twentySecAgo = new RealDate(mockNow.getTime() - 20 * 1000);
    const tenSecFuture = new RealDate(mockNow.getTime() + 10 * 1000); // device clock skew

    global.Date = class extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(mockNow.getTime());
        } else {
          super(args[0], ...(args.slice(1) as []));
        }
      }
      static now() {
        return mockNow.getTime();
      }
    } as any;

    expect(formatRelativeActivity(twentySecAgo.toISOString(), 'hi')).toBe('अभी-अभी');
    expect(formatRelativeActivity(tenSecFuture.toISOString(), 'hi')).toBe('अभी-अभी');
    expect(formatRelativeActivity(twentySecAgo.toISOString(), 'en')).toBe('Just now');
  });

  it('handles empty date cleanly', () => {
    expect(formatRelativeActivity(undefined, 'hi')).toBe('कोई लेन-देन नहीं');
    expect(formatRelativeActivity('', 'hi')).toBe('कोई लेन-देन नहीं');
    expect(formatRelativeActivity(undefined, 'en')).toBe('No entries yet');
  });
});

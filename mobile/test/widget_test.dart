import 'package:arrival_desk/dates.dart';
import 'package:arrival_desk/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('week and range helpers use calendar dates', () {
    expect(mondayOf('2026-11-19'), '2026-11-16');
    expect(mondayOf('2026-11-22'), '2026-11-16');
    expect(addDays('2026-11-30', 1), '2026-12-01');
    expect(rangeLabel('2026-11-16', '2026-11-20'), '16 – 20 Nov 2026');
    expect(rangeLabel('2026-11-30', '2026-12-04'), '30 Nov – 4 Dec 2026');
    expect(clockLabel(14 * 60 + 5), '2:05 PM');
    expect(clockLabel(0), '12:00 AM');
  });

  test('guest kind: late only today, arrived and gone win', () {
    Guest g(String status, String? time, {String date = '2026-11-16'}) => Guest(
      id: 'x',
      visitDate: date,
      guestName: 'A',
      hostName: 'H',
      status: status,
      mine: true,
      canEdit: true,
      expectedArrival: time,
    );
    expect(g('EXPECTED', '09:00').kind(today: '2026-11-16', nowMinutes: 600), GuestKind.late);
    expect(g('EXPECTED', '11:00').kind(today: '2026-11-16', nowMinutes: 600), GuestKind.expected);
    expect(g('EXPECTED', '09:00', date: '2026-11-17').kind(today: '2026-11-16', nowMinutes: 600), GuestKind.expected);
    expect(g('CLEARED', '09:00').kind(today: '2026-11-16', nowMinutes: 600), GuestKind.arrived);
    expect(g('NO_SHOW', null).kind(today: '2026-11-16', nowMinutes: 600), GuestKind.gone);
    // Their day passed without checking in; arrived guests are never "missed".
    expect(g('EXPECTED', '09:00', date: '2026-11-15').kind(today: '2026-11-16', nowMinutes: 600), GuestKind.missed);
    expect(g('EXPECTED', null, date: '2026-11-15').kind(today: '2026-11-16', nowMinutes: 0), GuestKind.missed);
    expect(g('CLEARED', '09:00', date: '2026-11-15').kind(today: '2026-11-16', nowMinutes: 600), GuestKind.arrived);
  });
}

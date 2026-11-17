/// Calendar-date helpers on "YYYY-MM-DD" strings. "Today" always comes from the
/// server (office time), never from the phone's clock.
library;

const _weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const _months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

DateTime _parse(String iso) {
  final p = iso.split('-').map(int.parse).toList();
  return DateTime.utc(p[0], p[1], p[2]);
}

String _format(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String addDays(String iso, int days) => _format(_parse(iso).add(Duration(days: days)));

/// 1 = Monday … 7 = Sunday.
int weekdayOf(String iso) => _parse(iso).weekday;

String mondayOf(String iso) => addDays(iso, -(weekdayOf(iso) - 1));

String isoFromDate(DateTime date) => _format(DateTime.utc(date.year, date.month, date.day));

DateTime dateFromIso(String iso) {
  final d = _parse(iso);
  return DateTime(d.year, d.month, d.day);
}

/// "Monday 16 November"
String longDate(String iso) {
  final d = _parse(iso);
  return '${_weekdays[d.weekday - 1]} ${d.day} ${_months[d.month - 1]}';
}

/// "Mon"
String shortWeekday(String iso) => _weekdays[_parse(iso).weekday - 1].substring(0, 3);

int dayOfMonth(String iso) => _parse(iso).day;

/// "16 – 22 Nov 2026" or "30 Nov – 6 Dec 2026".
String rangeLabel(String from, String to) {
  final a = _parse(from);
  final b = _parse(to);
  String m(DateTime d) => _months[d.month - 1].substring(0, 3);
  if (a.year != b.year) return '${a.day} ${m(a)} ${a.year} – ${b.day} ${m(b)} ${b.year}';
  if (a.month != b.month) return '${a.day} ${m(a)} – ${b.day} ${m(b)} ${b.year}';
  return '${a.day} – ${b.day} ${m(b)} ${b.year}';
}

/// "Today", "Tomorrow", "Yesterday" or "Monday 16 November".
String friendlyDate(String iso, String today) {
  if (iso == today) return 'Today';
  if (iso == addDays(today, 1)) return 'Tomorrow';
  if (iso == addDays(today, -1)) return 'Yesterday';
  return longDate(iso);
}

/// "2:40 PM" from minutes since midnight.
String clockLabel(int minutes) {
  final h = (minutes ~/ 60) % 24;
  final m = minutes % 60;
  final h12 = h % 12 == 0 ? 12 : h % 12;
  return '$h12:${m.toString().padLeft(2, '0')} ${h < 12 ? 'AM' : 'PM'}';
}

/// "14:30" from a picked hour and minute.
String hhmm(int hour, int minute) => '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';

/// Office time that keeps ticking from the server's answer, so a phone with
/// the wrong clock or time zone still shows the right "now".
class OfficeClock {
  OfficeClock(this.serverMinutes) : _watch = Stopwatch()..start();
  final int serverMinutes;
  final Stopwatch _watch;
  int get minutes => serverMinutes + _watch.elapsed.inMinutes;
}

/// "November"
String monthName(String iso) => _months[_parse(iso).month - 1];

/// "November 2026"
String monthYear(String iso) {
  final d = _parse(iso);
  return '${_months[d.month - 1]} ${d.year}';
}

/// The 1st of the month a date falls in.
String firstOfMonth(String iso) {
  final d = _parse(iso);
  return _format(DateTime.utc(d.year, d.month, 1));
}

/// Same day [n] months later (clamped to the month's length), e.g. for month paging.
String addMonths(String iso, int n) {
  final d = _parse(iso);
  final first = DateTime.utc(d.year, d.month + n, 1);
  final lastDay = DateTime.utc(first.year, first.month + 1, 0).day;
  return _format(DateTime.utc(first.year, first.month, d.day > lastDay ? lastDay : d.day));
}

/// The six Monday-to-Sunday weeks shown for a month (always 42 days).
List<String> monthGrid(String iso) {
  final start = mondayOf(firstOfMonth(iso));
  return [for (var i = 0; i < 42; i++) addDays(start, i)];
}

bool sameMonth(String a, String b) => a.substring(0, 7) == b.substring(0, 7);

/// "TUE"
String weekdayCaps(String iso) => shortWeekday(iso).toUpperCase();

import 'package:flutter/material.dart';

import '../dates.dart';
import '../main.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';

/// Opens the add/edit form. Returns true when something was saved.
/// [data] is the screen's loaded guests: it supplies hosts, the floor's people
/// (for "Also notify") and recent companies.
Future<bool> openGuestForm(BuildContext context, {required String date, Guest? guest, GuestRange? data}) async {
  final companies = <String>[];
  for (final g in data?.guests ?? const <Guest>[]) {
    final c = g.company?.trim();
    if (c != null && c.isNotEmpty && !companies.contains(c)) companies.add(c);
  }
  final saved = await Navigator.of(context).push<bool>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => GuestFormScreen(
        date: date,
        guest: guest,
        hosts: data?.hosts ?? const [],
        people: data?.people ?? const [],
        recentCompanies: companies,
      ),
    ),
  );
  return saved ?? false;
}

enum _Step { guest, when, host, extras, review }

/// Add or edit a guest one question at a time: guest, when, host (+ "Also
/// notify"), extras, then review. Editing opens on the review step.
class GuestFormScreen extends StatefulWidget {
  const GuestFormScreen({
    super.key,
    required this.date,
    required this.hosts,
    required this.people,
    this.recentCompanies = const [],
    this.guest,
  });
  final String date;
  final Guest? guest;
  final List<Host> hosts;
  final List<Host> people;
  final List<String> recentCompanies;

  @override
  State<GuestFormScreen> createState() => _GuestFormScreenState();
}

class _GuestFormScreenState extends State<GuestFormScreen> {
  final _name = TextEditingController();
  final _company = TextEditingController();
  final _hostName = TextEditingController();
  final _plate = TextEditingController();
  final _vehicle = TextEditingController();
  final _notes = TextEditingController();
  final _nameFocus = FocusNode();

  late _Step _step;
  late String _date;
  TimeOfDay? _time;
  late String _host;
  List<String> _notify = [];
  bool _byCar = false;
  bool _busy = false;
  int _added = 0;
  String? _lastSaved;
  String? _error;

  Guest? get g => widget.guest;
  bool get _isNew => g == null;
  bool get _isAdmin => session.floor?.isAdmin ?? false;
  String get _me => session.user!.id;
  String get _today => session.today ?? widget.date;
  String get _hostId => _isAdmin ? _host : _me;
  List<String> get _notifyList => _notify.where((id) => id != _hostId).toList();

  @override
  void initState() {
    super.initState();
    _step = _isNew ? _Step.guest : _Step.review;
    _date = g?.visitDate ?? widget.date;
    _name.text = g?.guestName ?? '';
    _company.text = g?.company ?? '';
    _plate.text = g?.licensePlate ?? '';
    _vehicle.text = g?.vehicle ?? '';
    _notes.text = g?.notes ?? '';
    _byCar = g?.hasCar ?? false;
    final minutes = g?.expectedMinutes;
    if (minutes != null) _time = TimeOfDay(hour: minutes ~/ 60, minute: minutes % 60);
    _host = g == null ? _me : (g!.hostUserId ?? otherHost);
    if (g != null && g!.hostUserId == null) _hostName.text = g!.hostName;
    _notify = g?.notifyUsers.map((u) => u.id).toList() ?? [];
    for (final c in [_name, _company, _hostName, _plate, _vehicle, _notes]) {
      c.addListener(() => setState(() {}));
    }
  }

  @override
  void dispose() {
    for (final c in [_name, _company, _hostName, _plate, _vehicle, _notes]) {
      c.dispose();
    }
    _nameFocus.dispose();
    super.dispose();
  }

  String _nameOf(String id) {
    for (final h in [...widget.people, ...widget.hosts, ...?g?.notifyUsers]) {
      if (h.id == id) return h.name;
    }
    return id == _me ? session.user!.displayName : 'Someone';
  }

  String? _problem(_Step step) {
    if (step == _Step.guest && _name.text.trim().length < 2) return 'Enter the guest’s name.';
    if (step == _Step.host && _isAdmin && _host == otherHost && _hostName.text.trim().length < 2) {
      return 'Enter the host’s name.';
    }
    return null;
  }

  /// Move to [target]; going forward checks the steps in between.
  void _goTo(_Step target) {
    for (final s in _Step.values.where((s) => s.index < target.index)) {
      final issue = _problem(s);
      if (issue != null) {
        setState(() {
          _step = s;
          _error = issue;
        });
        return;
      }
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _error = null;
      _step = target;
    });
  }

  void _next() => _goTo(_Step.values[_step.index + 1]);

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _time ?? const TimeOfDay(hour: 9, minute: 0),
      initialEntryMode: TimePickerEntryMode.dial,
      helpText: 'Expected time',
      // Always 12-hour with AM/PM, whatever the phone's clock setting.
      builder: (context, child) =>
          MediaQuery(data: MediaQuery.of(context).copyWith(alwaysUse24HourFormat: false), child: child!),
    );
    if (picked != null) setState(() => _time = picked);
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: dateFromIso(_date),
      firstDate: DateTime(2024),
      lastDate: DateTime(2100),
      helpText: 'Visit date',
    );
    if (picked != null) setState(() => _date = isoFromDate(picked));
  }

  Future<void> _pickPeople() async {
    final chosen = await showModalBottomSheet<List<String>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: AppColors.panel,
      builder: (_) => _PeopleSheet(
        people: widget.people.where((p) => p.id != _hostId).toList(),
        selected: _notifyList,
        floorName: session.floor?.name ?? '',
      ),
    );
    if (chosen != null) setState(() => _notify = chosen);
  }

  Future<void> _save({bool another = false}) async {
    for (final s in _Step.values) {
      final issue = _problem(s);
      if (issue != null) {
        setState(() {
          _step = s;
          _error = issue;
        });
        return;
      }
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final name = _name.text.trim();
    try {
      await session.api.saveGuest(
        GuestInput(
          id: g?.id,
          floorId: session.floor!.id,
          visitDate: _date,
          guestName: name,
          company: _company.text,
          hostUserId: _hostId,
          hostName: _hostName.text,
          expectedArrival: _time == null ? '' : hhmm(_time!.hour, _time!.minute),
          notes: _notes.text,
          licensePlate: _byCar ? _plate.text : '',
          vehicle: _byCar ? _vehicle.text : '',
          notifyUserIds: _notifyList,
        ),
      );
      if (!mounted) return;
      if (another) {
        // Saved: open a new, empty form for the next guest.
        setState(() {
          _added++;
          _lastSaved = name;
          for (final c in [_name, _company, _hostName, _plate, _vehicle, _notes]) {
            c.clear();
          }
          _byCar = false;
          _time = null;
          _date = widget.date;
          _host = _me;
          _notify = [];
          _step = _Step.guest;
        });
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _nameFocus.requestFocus();
        });
      } else {
        Navigator.of(context).pop(true);
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /* ---------------- Building blocks ---------------- */

  String get _whenText =>
      '${_date == _today ? 'Today' : longDate(_date)} · '
      '${_time == null ? 'Any time' : clockLabel(_time!.hour * 60 + _time!.minute)}';

  String get _hostText {
    final who = _hostId == _me
        ? 'You'
        : (_host == otherHost
              ? (_hostName.text.trim().isEmpty ? 'Someone else' : _hostName.text.trim())
              : _nameOf(_host));
    final n = _notifyList.length;
    return n == 0 ? 'Host: $who' : 'Host: $who · +$n notified';
  }

  List<String> get _answers => [
    if (_step.index > 0) [_name.text.trim(), _company.text.trim()].where((s) => s.isNotEmpty).join(' · '),
    if (_step.index > 1) _whenText,
    if (_step.index > 2) _hostText,
  ];

  @override
  Widget build(BuildContext context) {
    final review = _step == _Step.review;
    return PopScope(
      canPop: false,
      // Android's back gesture also reports guests already saved, so the list refreshes.
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !_busy) Navigator.of(context).pop(_added > 0);
      },
      child: Scaffold(
        backgroundColor: AppColors.paper,
        appBar: AppBar(
          leading: IconButton(
            tooltip: 'Close',
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.of(context).pop(_added > 0),
          ),
          title: Text(_isNew ? 'Add guest' : 'Edit guest'),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Center(
                child: Text(
                  review ? 'Review' : 'Step ${_step.index + 1} of 4',
                  style: const TextStyle(color: AppColors.muted, fontSize: 13),
                ),
              ),
            ),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(16),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Row(
                children: [
                  for (var i = 0; i < 4; i++) ...[
                    if (i > 0) const SizedBox(width: 6),
                    Expanded(
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 250),
                        height: 4,
                        decoration: BoxDecoration(
                          color: i <= _step.index ? AppColors.signal : AppColors.line,
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
        body: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
                children: [
                  if (_lastSaved != null && _step == _Step.guest)
                    Container(
                      margin: const EdgeInsets.only(bottom: 6),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(color: AppColors.clearedSoft, borderRadius: BorderRadius.circular(12)),
                      child: Row(
                        children: [
                          const Icon(Icons.check_circle, size: 20, color: AppColors.cleared),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _added > 1 ? '$_lastSaved saved · $_added guests added' : '$_lastSaved saved',
                              style: const TextStyle(color: AppColors.clearedInk, fontWeight: FontWeight.w600),
                            ),
                          ),
                        ],
                      ),
                    ),
                  if (_answers.isNotEmpty && !review)
                    Wrap(
                      spacing: 14,
                      runSpacing: 6,
                      children: [
                        for (final a in _answers)
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.check, size: 15, color: AppColors.cleared),
                              const SizedBox(width: 4),
                              Flexible(
                                child: Text(a, style: const TextStyle(fontSize: 13, color: AppColors.muted)),
                              ),
                            ],
                          ),
                      ],
                    ),
                  const SizedBox(height: 12),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 220),
                    transitionBuilder: (child, animation) => FadeTransition(
                      opacity: animation,
                      child: SlideTransition(
                        position: Tween(begin: const Offset(0.04, 0), end: Offset.zero).animate(animation),
                        child: child,
                      ),
                    ),
                    child: KeyedSubtree(key: ValueKey(_step), child: _stepBody()),
                  ),
                  if (_error != null) ...[const SizedBox(height: 12), ErrorBanner(message: _error!)],
                ],
              ),
            ),
            // In the body (not bottomNavigationBar) so it rides above the keyboard.
            SafeArea(top: false, child: _actionBar(review)),
          ],
        ),
      ),
    );
  }

  /// Back / Next, or the save buttons on the review step.
  Widget _actionBar(bool review) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.panel,
        border: Border(top: BorderSide(color: AppColors.line)),
      ),
      padding: const EdgeInsets.fromLTRB(12, 10, 16, 10),
      child: review
          ? Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                FilledButton(
                  onPressed: _busy ? null : () => _save(),
                  style: FilledButton.styleFrom(shape: const StadiumBorder()),
                  child: Text(_busy ? 'Saving…' : (_isNew ? 'Save guest' : 'Save changes')),
                ),
                if (_isNew) ...[
                  const SizedBox(height: 8),
                  OutlinedButton(
                    onPressed: _busy ? null : () => _save(another: true),
                    style: OutlinedButton.styleFrom(shape: const StadiumBorder()),
                    child: const Text('Save and Add more Guests'),
                  ),
                ],
              ],
            )
          : Row(
              children: [
                if (_step != _Step.guest)
                  TextButton.icon(
                    onPressed: () => _goTo(_Step.values[_step.index - 1]),
                    icon: const Icon(Icons.chevron_left),
                    label: const Text('Back'),
                  ),
                const Spacer(),
                if (_step == _Step.extras)
                  TextButton(
                    onPressed: () => _goTo(_Step.review),
                    style: TextButton.styleFrom(foregroundColor: AppColors.muted),
                    child: const Text('Skip'),
                  ),
                const SizedBox(width: 6),
                FilledButton(
                  onPressed: _next,
                  style: FilledButton.styleFrom(
                    shape: const StadiumBorder(),
                    padding: const EdgeInsets.symmetric(horizontal: 28),
                  ),
                  child: Text(_step == _Step.extras ? 'Review' : 'Next'),
                ),
              ],
            ),
    );
  }

  Widget _question(String text, [String? hint]) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(text, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w500, letterSpacing: -0.3)),
        if (hint != null) ...[
          const SizedBox(height: 4),
          Text(hint, style: const TextStyle(color: AppColors.muted, fontSize: 14.5)),
        ],
      ],
    ),
  );

  Widget _chip(String label, bool on, VoidCallback onTap) => ChoiceChip(
    label: Text(label),
    selected: on,
    onSelected: (_) => onTap(),
    showCheckmark: false,
    selectedColor: AppColors.signalSoft,
    backgroundColor: AppColors.panel,
    side: BorderSide(color: on ? AppColors.signal : AppColors.lineStrong),
    labelStyle: TextStyle(
      color: on ? AppColors.signalDeep : AppColors.ink,
      fontWeight: on ? FontWeight.w600 : FontWeight.w400,
    ),
    shape: const StadiumBorder(),
  );

  Widget _stepBody() => switch (_step) {
    _Step.guest => _guestStep(),
    _Step.when => _whenStep(),
    _Step.host => _hostStep(),
    _Step.extras => _extrasStep(),
    _Step.review => _reviewStep(),
  };

  Widget _guestStep() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _question('Who’s coming?', 'Their name as reception will see it.'),
      TextField(
        controller: _name,
        focusNode: _nameFocus,
        autofocus: _isNew && _added == 0,
        textCapitalization: TextCapitalization.words,
        textInputAction: TextInputAction.next,
        decoration: const InputDecoration(labelText: 'Guest name'),
      ),
      const SizedBox(height: 14),
      TextField(
        controller: _company,
        textCapitalization: TextCapitalization.words,
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => _next(),
        decoration: const InputDecoration(labelText: 'Company (optional)'),
      ),
      if (widget.recentCompanies.isNotEmpty) ...[
        const SizedBox(height: 14),
        const Text('Recent companies', style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final c in widget.recentCompanies.take(6))
              _chip(c, _company.text.trim() == c, () => _company.text = c),
          ],
        ),
      ],
    ],
  );

  Widget _whenStep() {
    final days = [for (var i = 0; i < 4; i++) addDays(_today, i)];
    final quick = [
      const TimeOfDay(hour: 9, minute: 0),
      const TimeOfDay(hour: 10, minute: 0),
      const TimeOfDay(hour: 11, minute: 0),
      const TimeOfDay(hour: 14, minute: 0),
      const TimeOfDay(hour: 15, minute: 0),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _question('When are they coming?'),
        const Text(
          'Date',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            for (var i = 0; i < days.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              Expanded(
                child: Material(
                  color: days[i] == _date ? AppColors.ink : AppColors.panel,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: BorderSide(color: days[i] == _date ? AppColors.ink : AppColors.lineStrong),
                  ),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () => setState(() => _date = days[i]),
                    child: SizedBox(
                      height: 76,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            weekdayCaps(days[i]),
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: days[i] == _date ? Colors.white70 : AppColors.muted,
                            ),
                          ),
                          Text(
                            '${dayOfMonth(days[i])}',
                            style: TextStyle(fontSize: 22, color: days[i] == _date ? Colors.white : AppColors.ink),
                          ),
                          Text(
                            i == 0 ? 'Today' : (i == 1 ? 'Tomorrow' : ''),
                            style: TextStyle(fontSize: 11, color: days[i] == _date ? Colors.white70 : AppColors.muted),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: _pickDate,
            icon: const Icon(Icons.event_outlined, size: 18),
            label: Text(days.contains(_date) ? 'Another date' : longDate(_date)),
            style: TextButton.styleFrom(foregroundColor: AppColors.signalDeep),
          ),
        ),
        const SizedBox(height: 10),
        const Text(
          'Expected time',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted),
        ),
        const SizedBox(height: 8),
        Material(
          color: AppColors.panel,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(color: _time != null ? AppColors.ink : AppColors.lineStrong, width: _time != null ? 2 : 1),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: _pickTime,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  const Icon(Icons.schedule, color: AppColors.muted),
                  const SizedBox(width: 12),
                  Text(
                    _time == null ? 'Any time' : clockLabel(_time!.hour * 60 + _time!.minute),
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w500,
                      color: _time == null ? AppColors.muted : AppColors.ink,
                    ),
                  ),
                  const Spacer(),
                  const Text(
                    'Change',
                    style: TextStyle(color: AppColors.signalDeep, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _chip('Any time', _time == null, () => setState(() => _time = null)),
            for (final t in quick)
              _chip(clockLabel(t.hour * 60 + t.minute), _time == t, () => setState(() => _time = t)),
          ],
        ),
      ],
    );
  }

  Widget _hostStep() {
    final hosts = [...widget.hosts];
    if (_isAdmin && !hosts.any((h) => h.id == _me)) hosts.insert(0, Host(id: _me, name: session.user!.displayName));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _question('Who are they visiting?'),
        if (_isAdmin)
          Panel(
            child: RadioGroup<String>(
              groupValue: _host,
              onChanged: (v) => setState(() => _host = v ?? _me),
              child: Column(
                children: [
                  if (g?.hostUserId != null && !hosts.any((h) => h.id == g!.hostUserId))
                    RadioListTile<String>(
                      value: g!.hostUserId!,
                      title: Text('${g!.hostName} (no longer on this floor)'),
                    ),
                  for (var i = 0; i < hosts.length; i++) ...[
                    if (i > 0) const RowDivider(indent: 56),
                    RadioListTile<String>(
                      value: hosts[i].id,
                      title: Text(hosts[i].id == _me ? 'Me (${hosts[i].name})' : hosts[i].name),
                    ),
                  ],
                  const RowDivider(indent: 56),
                  const RadioListTile<String>(
                    value: otherHost,
                    title: Text('Someone else'),
                    subtitle: Text('Type a name; they won’t get alerts'),
                  ),
                  if (_host == otherHost)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                      child: TextField(
                        controller: _hostName,
                        autofocus: true,
                        textCapitalization: TextCapitalization.words,
                        decoration: const InputDecoration(labelText: 'Host’s name'),
                      ),
                    ),
                ],
              ),
            ),
          )
        else
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: AppColors.panel2, borderRadius: BorderRadius.circular(12)),
            child: const Text(
              'You’re the host. You’ll get an alert when reception checks them in.',
              style: TextStyle(color: AppColors.muted),
            ),
          ),
        const SizedBox(height: 22),
        const Row(
          children: [
            Icon(Icons.notifications_none, color: AppColors.muted, size: 20),
            SizedBox(width: 8),
            Text('Also notify', style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600)),
            SizedBox(width: 8),
            Text('optional', style: TextStyle(fontSize: 13, color: AppColors.muted)),
          ],
        ),
        const SizedBox(height: 4),
        const Text(
          'They’ll see this guest and get an alert when they arrive.',
          style: TextStyle(fontSize: 13, color: AppColors.muted),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (final id in _notifyList)
              InputChip(
                avatar: CircleAvatar(
                  backgroundColor: AppColors.idleSoft,
                  child: Text(_initials(_nameOf(id)), style: const TextStyle(fontSize: 10, color: AppColors.ink)),
                ),
                label: Text(_nameOf(id)),
                onDeleted: () => setState(() => _notify.remove(id)),
                backgroundColor: AppColors.panel,
                side: const BorderSide(color: AppColors.lineStrong),
                shape: const StadiumBorder(),
              ),
            if (widget.people.any((p) => p.id != _hostId && !_notifyList.contains(p.id)))
              ActionChip(
                avatar: const Icon(Icons.add, size: 18, color: AppColors.signalDeep),
                label: const Text(
                  'Add people',
                  style: TextStyle(color: AppColors.signalDeep, fontWeight: FontWeight.w600),
                ),
                onPressed: _pickPeople,
                backgroundColor: AppColors.panel,
                side: const BorderSide(color: AppColors.lineStrong),
                shape: const StadiumBorder(),
              ),
          ],
        ),
      ],
    );
  }

  Widget _extrasStep() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _question('Anything else for reception?', 'All optional. Skip if not needed.'),
      Panel(
        child: Column(
          children: [
            SwitchListTile(
              value: _byCar,
              onChanged: (v) => setState(() => _byCar = v),
              secondary: const Icon(Icons.directions_car_outlined),
              title: const Text('Coming by car', style: TextStyle(fontWeight: FontWeight.w600)),
              subtitle: const Text('Reception arranges parking'),
            ),
            if (_byCar)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                child: Row(
                  children: [
                    Expanded(
                      flex: 5,
                      child: TextField(
                        controller: _plate,
                        textCapitalization: TextCapitalization.characters,
                        maxLength: 20,
                        style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w600, letterSpacing: 1),
                        decoration: const InputDecoration(labelText: 'Plate', hintText: 'AA 3-B12345', counterText: ''),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 6,
                      child: TextField(
                        controller: _vehicle,
                        textCapitalization: TextCapitalization.sentences,
                        maxLength: 80,
                        decoration: const InputDecoration(labelText: 'Car', hintText: 'White Corolla', counterText: ''),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
      const SizedBox(height: 16),
      TextField(
        controller: _notes,
        minLines: 2,
        maxLines: 5,
        maxLength: 500,
        textCapitalization: TextCapitalization.sentences,
        decoration: const InputDecoration(labelText: 'Notes for reception', hintText: 'e.g. Bring to meeting room 3'),
      ),
    ],
  );

  Widget _reviewStep() {
    Widget card(IconData icon, String label, List<Widget> lines, _Step step) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Panel(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 4, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 2, right: 14),
                child: Icon(icon, color: AppColors.muted),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.8,
                        color: AppColors.muted,
                      ),
                    ),
                    const SizedBox(height: 2),
                    ...lines,
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Change ${label.toLowerCase()}',
                icon: const Icon(Icons.edit_outlined, color: AppColors.signalDeep, size: 20),
                onPressed: () => _goTo(step),
              ),
            ],
          ),
        ),
      ),
    );
    const main = TextStyle(fontSize: 15.5);
    const sub = TextStyle(fontSize: 14, color: AppColors.muted);
    final hostWho = _hostId == _me ? 'You' : (_host == otherHost ? _hostName.text.trim() : _nameOf(_host));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _question('Ready to ${_isNew ? 'add' : 'save'}?', 'Tap the pencil to change anything.'),
        card(Icons.person_outline, 'GUEST', [
          Text(_name.text.trim(), style: main),
          if (_company.text.trim().isNotEmpty) Text(_company.text.trim(), style: sub),
        ], _Step.guest),
        card(Icons.schedule, 'WHEN', [
          Text(_date == _today ? 'Today, ${longDate(_date)}' : longDate(_date), style: main),
          Text(_time == null ? 'Any time' : clockLabel(_time!.hour * 60 + _time!.minute), style: sub),
        ], _Step.when),
        card(Icons.notifications_none, 'HOST AND ALERTS', [
          Text(hostWho, style: main),
          Text(
            _notifyList.isEmpty ? 'No one else notified' : 'Also notifying ${_notifyList.map(_nameOf).join(', ')}',
            style: sub,
          ),
        ], _Step.host),
        card(Icons.directions_car_outlined, 'EXTRAS', [
          if (_byCar)
            Wrap(
              spacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                if (_plate.text.trim().isNotEmpty) PlateTag(_plate.text.trim().toUpperCase()),
                Text(
                  _vehicle.text.trim().isNotEmpty
                      ? _vehicle.text.trim()
                      : (_plate.text.trim().isEmpty ? 'Coming by car' : ''),
                  style: main,
                ),
              ],
            )
          else
            const Text('Not coming by car', style: main),
          Text(_notes.text.trim().isEmpty ? 'No notes' : _notes.text.trim(), style: sub),
        ], _Step.extras),
      ],
    );
  }

  static String _initials(String name) =>
      name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).take(2).map((p) => p[0].toUpperCase()).join();
}

/// Searchable list of the floor's people for "Also notify".
class _PeopleSheet extends StatefulWidget {
  const _PeopleSheet({required this.people, required this.selected, required this.floorName});
  final List<Host> people;
  final List<String> selected;
  final String floorName;

  @override
  State<_PeopleSheet> createState() => _PeopleSheetState();
}

class _PeopleSheetState extends State<_PeopleSheet> {
  late final Set<String> _chosen = {...widget.selected};
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final needle = _query.trim().toLowerCase();
    final list = widget.people.where((p) => needle.isEmpty || p.name.toLowerCase().contains(needle)).toList();
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.7,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  const Text('Also notify', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w500)),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      widget.floorName,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AppColors.muted, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
              child: TextField(
                onChanged: (v) => setState(() => _query = v),
                decoration: InputDecoration(
                  hintText: 'Search people on this floor',
                  prefixIcon: const Icon(Icons.search),
                  filled: true,
                  fillColor: AppColors.paper,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: BorderSide.none),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(999),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
            ),
            Expanded(
              child: list.isEmpty
                  ? Center(
                      child: Text(
                        widget.people.isEmpty ? 'No one else is on this floor yet.' : 'No one matches.',
                        style: const TextStyle(color: AppColors.muted),
                      ),
                    )
                  : ListView(
                      children: [
                        for (final p in list)
                          CheckboxListTile(
                            value: _chosen.contains(p.id),
                            onChanged: (v) => setState(() => v == true ? _chosen.add(p.id) : _chosen.remove(p.id)),
                            controlAffinity: ListTileControlAffinity.leading,
                            activeColor: AppColors.signal,
                            secondary: CircleAvatar(
                              backgroundColor: AppColors.idleSoft,
                              foregroundColor: AppColors.ink,
                              child: Text(
                                p.name.trim().split(RegExp(r'\s+')).take(2).map((w) => w[0].toUpperCase()).join(),
                                style: const TextStyle(fontSize: 13),
                              ),
                            ),
                            title: Text(p.name),
                          ),
                      ],
                    ),
            ),
            SafeArea(
              top: false,
              child: Container(
                decoration: const BoxDecoration(
                  border: Border(top: BorderSide(color: AppColors.line)),
                ),
                padding: const EdgeInsets.fromLTRB(20, 10, 16, 10),
                child: Row(
                  children: [
                    Text('${_chosen.length} selected', style: const TextStyle(color: AppColors.muted)),
                    const Spacer(),
                    FilledButton(
                      onPressed: () =>
                          Navigator.of(context).pop(widget.people.map((p) => p.id).where(_chosen.contains).toList()),
                      style: FilledButton.styleFrom(
                        shape: const StadiumBorder(),
                        padding: const EdgeInsets.symmetric(horizontal: 28),
                      ),
                      child: const Text('Done'),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

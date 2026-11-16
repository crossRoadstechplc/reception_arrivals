import 'package:flutter/material.dart';

import '../dates.dart';
import '../main.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets.dart';

/// Opens the add/edit form. Returns true when something was saved.
Future<bool> openGuestForm(BuildContext context, {required String date, Guest? guest, required List<Host> hosts}) async {
  final saved = await Navigator.of(context).push<bool>(
    MaterialPageRoute(fullscreenDialog: true, builder: (_) => GuestFormScreen(date: date, guest: guest, hosts: hosts)),
  );
  return saved ?? false;
}

class GuestFormScreen extends StatefulWidget {
  const GuestFormScreen({super.key, required this.date, required this.hosts, this.guest});
  final String date;
  final Guest? guest;
  final List<Host> hosts;

  @override
  State<GuestFormScreen> createState() => _GuestFormScreenState();
}

class _GuestFormScreenState extends State<GuestFormScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _company = TextEditingController();
  final _hostName = TextEditingController();
  final _plate = TextEditingController();
  final _vehicle = TextEditingController();
  final _notes = TextEditingController();
  final _nameFocus = FocusNode();

  late String _date;
  TimeOfDay? _time;
  late String _host;
  bool _byCar = false;
  bool _busy = false;
  int _added = 0;
  String? _error;

  Guest? get g => widget.guest;
  bool get _isAdmin => session.floor?.isAdmin ?? false;

  @override
  void initState() {
    super.initState();
    _date = widget.date;
    _name.text = g?.guestName ?? '';
    _company.text = g?.company ?? '';
    _plate.text = g?.licensePlate ?? '';
    _vehicle.text = g?.vehicle ?? '';
    _notes.text = g?.notes ?? '';
    _byCar = g?.hasCar ?? false;
    final minutes = g?.expectedMinutes;
    if (minutes != null) _time = TimeOfDay(hour: minutes ~/ 60, minute: minutes % 60);
    final me = session.user!.id;
    _host = g == null ? me : (g!.hostUserId ?? otherHost);
    if (g != null && g!.hostUserId == null) _hostName.text = g!.hostName;
  }

  @override
  void dispose() {
    for (final c in [_name, _company, _hostName, _plate, _vehicle, _notes]) {
      c.dispose();
    }
    _nameFocus.dispose();
    super.dispose();
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _time ?? const TimeOfDay(hour: 9, minute: 0),
      initialEntryMode: TimePickerEntryMode.dial,
      helpText: 'Expected time',
      // Always 12-hour with AM/PM, whatever the phone's clock setting.
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(alwaysUse24HourFormat: false),
        child: child!,
      ),
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

  Future<void> _save({bool another = false}) async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final floor = session.floor!;
    final name = _name.text.trim();
    try {
      await session.api.saveGuest(
        GuestInput(
          id: g?.id,
          floorId: floor.id,
          visitDate: _date,
          guestName: name,
          company: _company.text,
          hostUserId: _isAdmin ? _host : session.user!.id,
          hostName: _hostName.text,
          expectedArrival: _time == null ? '' : hhmm(_time!.hour, _time!.minute),
          notes: _notes.text,
          licensePlate: _byCar ? _plate.text : '',
          vehicle: _byCar ? _vehicle.text : '',
        ),
      );
      if (!mounted) return;
      if (another) {
        // Keep date, host and company; clear the per-guest fields.
        setState(() {
          _added++;
          _name.clear();
          _notes.clear();
          _plate.clear();
          _vehicle.clear();
          _byCar = false;
          _time = null;
        });
        showMessage(context, '$name added');
        _nameFocus.requestFocus();
      } else {
        Navigator.of(context).pop(true);
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isNew = g == null;
    final hosts = widget.hosts;
    final me = session.user!;
    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            tooltip: 'Close',
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.of(context).pop(_added > 0),
          ),
          title: Text(isNew ? 'Add guest' : 'Edit guest'),
          actions: [
            TextButton(onPressed: _busy ? null : () => _save(), child: Text(_busy ? 'Saving…' : 'Save')),
            const SizedBox(width: 8),
          ],
        ),
        body: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              if (_added > 0)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text('$_added added so far. Host and company are kept for the next one.',
                      style: const TextStyle(color: AppColors.muted)),
                ),
              TextFormField(
                controller: _name,
                focusNode: _nameFocus,
                autofocus: isNew,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Guest name'),
                validator: (v) => (v ?? '').trim().length < 2 ? 'Enter the guest’s name' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _company,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Company (optional)'),
              ),
              const SizedBox(height: 16),
              if (_isAdmin) ...[
                DropdownButtonFormField<String>(
                  initialValue: _host,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Who are they visiting?'),
                  items: [
                    if (g?.hostUserId != null && !hosts.any((h) => h.id == g!.hostUserId))
                      DropdownMenuItem(value: g!.hostUserId, child: Text('${g!.hostName} (no longer on this floor)')),
                    if (!hosts.any((h) => h.id == me.id)) DropdownMenuItem(value: me.id, child: Text('Me (${me.displayName})')),
                    for (final h in hosts)
                      DropdownMenuItem(value: h.id, child: Text(h.id == me.id ? 'Me (${h.name})' : h.name)),
                    const DropdownMenuItem(value: otherHost, child: Text('Someone else (type a name)')),
                  ],
                  onChanged: (v) => setState(() => _host = v ?? me.id),
                ),
                if (_host == otherHost) ...[
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _hostName,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(labelText: 'Host’s name'),
                    validator: (v) => (v ?? '').trim().length < 2 ? 'Enter the host’s name' : null,
                  ),
                ] else
                  const Padding(
                    padding: EdgeInsets.only(top: 6, left: 4),
                    child: Text('They’ll get an alert when reception checks the guest in.',
                        style: TextStyle(color: AppColors.muted, fontSize: 13)),
                  ),
              ] else
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: AppColors.panel2, borderRadius: BorderRadius.circular(12)),
                  child: const Text('You’re the host. You’ll get an alert when reception checks them in.',
                      style: TextStyle(color: AppColors.muted)),
                ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: _PickerField(
                      label: 'Visit date',
                      value: friendlyDate(_date, session.today ?? ''),
                      icon: Icons.event_outlined,
                      onTap: _pickDate,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _PickerField(
                      label: 'Expected time',
                      value: _time == null ? null : clockLabel(_time!.hour * 60 + _time!.minute),
                      placeholder: 'Any time',
                      icon: Icons.schedule,
                      onTap: _pickTime,
                      onClear: _time == null ? null : () => setState(() => _time = null),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                decoration: BoxDecoration(
                  color: AppColors.panel,
                  border: Border.all(color: AppColors.line),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    SwitchListTile(
                      value: _byCar,
                      onChanged: (v) => setState(() => _byCar = v),
                      secondary: const Icon(Icons.directions_car_outlined),
                      title: const Text('Coming by car', style: TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: const Text('Reception will arrange parking for them.'),
                    ),
                    if (_byCar)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                        child: Column(
                          children: [
                            TextFormField(
                              controller: _plate,
                              textCapitalization: TextCapitalization.characters,
                              maxLength: 20,
                              style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w600, letterSpacing: 1),
                              decoration: const InputDecoration(labelText: 'License plate (optional)', hintText: 'AA 3-B12345', counterText: ''),
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _vehicle,
                              textCapitalization: TextCapitalization.sentences,
                              maxLength: 80,
                              decoration: const InputDecoration(labelText: 'Car (optional)', hintText: 'White Toyota Corolla', counterText: ''),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _notes,
                minLines: 2,
                maxLines: 5,
                maxLength: 500,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Notes for reception (optional)', hintText: 'e.g. Bring to meeting room 3'),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                ErrorBanner(message: _error!),
              ],
              const SizedBox(height: 16),
              FilledButton(onPressed: _busy ? null : () => _save(), child: Text(_busy ? 'Saving…' : (isNew ? 'Save guest' : 'Save changes'))),
              if (isNew) ...[
                const SizedBox(height: 8),
                OutlinedButton(onPressed: _busy ? null : () => _save(another: true), child: const Text('Save & add another')),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _PickerField extends StatelessWidget {
  const _PickerField({required this.label, required this.icon, required this.onTap, this.value, this.placeholder, this.onClear});
  final String label;
  final String? value;
  final String? placeholder;
  final IconData icon;
  final VoidCallback onTap;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            suffixIcon: onClear != null
                ? IconButton(tooltip: 'Clear', icon: const Icon(Icons.close, size: 18), onPressed: onClear)
                : Icon(icon, size: 20, color: AppColors.muted),
          ),
          child: Text(
            value ?? placeholder ?? '',
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontWeight: FontWeight.w600, color: value == null ? AppColors.muted : AppColors.ink),
          ),
        ),
      );
}

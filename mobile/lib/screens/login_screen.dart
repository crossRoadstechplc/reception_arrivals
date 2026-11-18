import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../main.dart';
import '../theme.dart';

enum _Mode { email, code, password }

/// Sign in with a code sent by email, or with a password as the backup.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  static const _resendSeconds = 30;

  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  final _codeFocus = FocusNode();
  _Mode _mode = _Mode.email;
  bool _busy = false;
  bool _hide = true;
  int _wait = 0;
  Timer? _timer;
  String? _error;

  @override
  void initState() {
    super.initState();
    _error = session.signedOutReason;
  }

  @override
  void dispose() {
    _timer?.cancel();
    _email.dispose();
    _password.dispose();
    _code.dispose();
    _codeFocus.dispose();
    super.dispose();
  }

  void _switchTo(_Mode mode) => setState(() {
    _mode = mode;
    _error = null;
    _code.clear();
  });

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _startResendTimer() {
    _timer?.cancel();
    setState(() => _wait = _resendSeconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return timer.cancel();
      setState(() => _wait--);
      if (_wait <= 0) timer.cancel();
    });
  }

  Future<void> _sendCode() async {
    if (_mode == _Mode.email && !_form.currentState!.validate()) return;
    await _run(() async {
      await session.api.requestLoginCode(_email.text);
      if (!mounted) return;
      _code.clear();
      setState(() => _mode = _Mode.code);
      _startResendTimer();
      _codeFocus.requestFocus();
    });
  }

  Future<void> _verifyCode() async {
    if (_busy || _code.text.length != 6) return;
    await _run(() => session.signInWithCode(_email.text, _code.text));
    if (mounted && _error != null) {
      _code.clear();
      _codeFocus.requestFocus();
    }
  }

  Future<void> _signInWithPassword() async {
    if (!_form.currentState!.validate()) return;
    await _run(() => session.signIn(_email.text, _password.text));
  }

  Widget _emailField({bool autofocus = false}) => TextFormField(
    controller: _email,
    autofocus: autofocus,
    keyboardType: TextInputType.emailAddress,
    textCapitalization: TextCapitalization.none,
    autocorrect: false,
    enableSuggestions: false,
    autofillHints: const [AutofillHints.email],
    textInputAction: _mode == _Mode.password ? TextInputAction.next : TextInputAction.done,
    onFieldSubmitted: _mode == _Mode.email ? (_) => _sendCode() : null,
    decoration: const InputDecoration(labelText: 'Work email'),
    validator: (v) => (v == null || !v.contains('@')) ? 'Enter your email' : null,
  );

  List<Widget> _emailStep() => [
    _emailField(),
    const SizedBox(height: 20),
    FilledButton(onPressed: _busy ? null : _sendCode, child: Text(_busy ? 'Sending…' : 'Email me a code')),
    const SizedBox(height: 8),
    TextButton(onPressed: _busy ? null : () => _switchTo(_Mode.password), child: const Text('Use password instead')),
  ];

  List<Widget> _codeStep() => [
    const Text(
      'Enter your code',
      textAlign: TextAlign.center,
      style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
    ),
    const SizedBox(height: 6),
    Text(
      'We sent a 6-digit code to\n${_email.text.trim()}',
      textAlign: TextAlign.center,
      style: const TextStyle(color: AppColors.muted),
    ),
    const SizedBox(height: 18),
    TextFormField(
      controller: _code,
      focusNode: _codeFocus,
      autofocus: true,
      keyboardType: TextInputType.number,
      textAlign: TextAlign.center,
      maxLength: 6,
      autofillHints: const [AutofillHints.oneTimeCode],
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      style: const TextStyle(fontFamily: 'monospace', fontSize: 28, fontWeight: FontWeight.w700, letterSpacing: 10),
      decoration: const InputDecoration(labelText: 'Sign-in code', counterText: ''),
      onChanged: (value) {
        if (value.length == 6) _verifyCode();
      },
    ),
    const SizedBox(height: 20),
    FilledButton(onPressed: _busy ? null : _verifyCode, child: Text(_busy ? 'Signing in…' : 'Sign in')),
    const SizedBox(height: 8),
    Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Flexible(
          child: TextButton(
            onPressed: _busy ? null : () => _switchTo(_Mode.email),
            child: const Text('Use a different email'),
          ),
        ),
        Flexible(
          child: TextButton(
            onPressed: _busy || _wait > 0 ? null : _sendCode,
            child: Text(_wait > 0 ? 'Resend in ${_wait}s' : 'Resend code'),
          ),
        ),
      ],
    ),
  ];

  List<Widget> _passwordStep() => [
    _emailField(),
    const SizedBox(height: 12),
    TextFormField(
      controller: _password,
      obscureText: _hide,
      autofocus: true,
      autofillHints: const [AutofillHints.password],
      textInputAction: TextInputAction.done,
      onFieldSubmitted: (_) => _signInWithPassword(),
      decoration: InputDecoration(
        labelText: 'Password',
        suffixIcon: IconButton(
          tooltip: _hide ? 'Show password' : 'Hide password',
          icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined),
          onPressed: () => setState(() => _hide = !_hide),
        ),
      ),
      validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
    ),
    const SizedBox(height: 20),
    FilledButton(onPressed: _busy ? null : _signInWithPassword, child: Text(_busy ? 'Signing in…' : 'Sign in')),
    const SizedBox(height: 8),
    TextButton(onPressed: _busy ? null : () => _switchTo(_Mode.email), child: const Text('Email me a code instead')),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _form,
                child: AutofillGroup(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Center(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(18),
                          child: Image.asset('assets/icon/icon.png', width: 72, height: 72),
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(text: 'Arrival '),
                            TextSpan(
                              text: 'Desk',
                              style: TextStyle(color: AppColors.signal),
                            ),
                          ],
                        ),
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, letterSpacing: -0.5),
                      ),
                      const SizedBox(height: 32),
                      if (_error != null) ...[
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.dangerSoft,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            _error!,
                            style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w500),
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],
                      ...switch (_mode) {
                        _Mode.email => _emailStep(),
                        _Mode.code => _codeStep(),
                        _Mode.password => _passwordStep(),
                      },
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'notifications.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/splash_screen.dart';
import 'session.dart';
import 'theme.dart';
import 'updater.dart';

final session = Session();

/// Lets services (like the updater) show dialogs from anywhere.
final navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.transparent));
  // Start the animated splash right away; set up alerts and restore the sign-in behind it.
  runApp(ArrivalDeskApp(starting: _start()));
}

Future<void> _start() async {
  await alerts.init();
  await updater.init();
  session.onSignedIn = alerts.attach;
  session.onSigningOut = alerts.detach;
  await session.restore();
}

class ArrivalDeskApp extends StatefulWidget {
  const ArrivalDeskApp({super.key, required this.starting});

  /// Finishes when the app is ready to show its first real screen.
  final Future<void> starting;

  @override
  State<ArrivalDeskApp> createState() => _ArrivalDeskAppState();
}

class _ArrivalDeskAppState extends State<ArrivalDeskApp> with WidgetsBindingObserver {
  bool _introDone = false;
  bool _started = false;

  bool get _showSplash => !_introDone || !_started;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.starting.whenComplete(() {
      if (mounted) setState(() => _started = true);
      _afterSplash();
    });
  }

  void _afterSplash() {
    // Offer a newer version, if there is one, once the first real screen is up.
    if (_showSplash) return;
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkForUpdate());
  }

  void _checkForUpdate() => updater.checkAndPrompt(() => navigatorKey.currentContext);

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Back in the app: reload guests and re-check alert permission (it may have changed in Settings).
    if (state == AppLifecycleState.resumed && !_showSplash) {
      _checkForUpdate();
      if (session.signedIn) {
        requestRefresh();
        alerts.recheck();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Arrival Desk',
      navigatorKey: navigatorKey,
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: AnimatedSwitcher(
        duration: const Duration(milliseconds: 450),
        switchInCurve: Curves.easeOut,
        child: _showSplash
            ? SplashScreen(
                key: const ValueKey('splash'),
                onIntroDone: () {
                  if (!mounted) return;
                  setState(() => _introDone = true);
                  _afterSplash();
                },
              )
            : ListenableBuilder(
                key: const ValueKey('app'),
                listenable: session,
                builder: (context, _) => session.signedIn ? const HomeScreen() : const LoginScreen(),
              ),
      ),
    );
  }
}

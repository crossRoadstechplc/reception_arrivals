import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../brand.dart';
import '../theme.dart';

/// Animated start screen, shown while the app restores the sign-in.
///
/// Picks up from Android's orange launch screen: the "A" draws itself, the
/// underline sweeps in, "arrival" rings ripple out, the name slides up and
/// three dots pulse until the app is ready.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, required this.onIntroDone});

  /// Called once the intro animation has played (the app may still be loading).
  final VoidCallback onIntroDone;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with TickerProviderStateMixin {
  late final AnimationController _intro = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  );
  late final AnimationController _loop = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))
    ..repeat();

  @override
  void initState() {
    super.initState();
    _intro.forward().whenComplete(widget.onIntroDone);
  }

  @override
  void dispose() {
    _intro.dispose();
    _loop.dispose();
    super.dispose();
  }

  Animation<double> _part(double begin, double end, [Curve curve = Curves.easeOutCubic]) => CurvedAnimation(
    parent: _intro,
    curve: Interval(begin, end, curve: curve),
  );

  @override
  Widget build(BuildContext context) {
    final strokes = _part(0.0, 0.45, Curves.easeInOutCubic);
    final underline = _part(0.35, 0.6);
    final pop = _part(0.0, 0.35, Curves.easeOutBack);
    final word = _part(0.45, 0.8);
    final dots = _part(0.75, 1.0);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        backgroundColor: AppColors.signal,
        body: AnimatedBuilder(
          animation: Listenable.merge([_intro, _loop]),
          builder: (context, _) {
            return Stack(
              fit: StackFit.expand,
              children: [
                // Soft vertical shading, like the logo tile.
                const Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Color(0xFFE46A37), Color(0xFFC94F20)],
                      ),
                    ),
                  ),
                ),
                // "Arrival" rings rippling out from the logo.
                Positioned.fill(
                  child: CustomPaint(
                    painter: _RipplePainter(progress: _loop.value, opacity: word.value),
                  ),
                ),
                Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Transform.scale(
                        scale: 0.7 + 0.3 * pop.value,
                        child: SizedBox(
                          width: 132,
                          height: 132,
                          child: CustomPaint(
                            painter: BrandLogoPainter(strokes: strokes.value, underline: underline.value),
                          ),
                        ),
                      ),
                      const SizedBox(height: 22),
                      Opacity(
                        opacity: word.value,
                        child: Transform.translate(
                          offset: Offset(0, 18 * (1 - word.value)),
                          child: const Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(text: 'Arrival '),
                                TextSpan(
                                  text: 'Desk',
                                  style: TextStyle(color: Color(0xFFFFE2D4)),
                                ),
                              ],
                            ),
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 30,
                              fontWeight: FontWeight.w700,
                              letterSpacing: -0.5,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Opacity(
                        opacity: word.value * 0.85,
                        child: const Text(
                          'Know the moment your guests arrive',
                          style: TextStyle(color: Colors.white, fontSize: 14, letterSpacing: 0.2),
                        ),
                      ),
                      const SizedBox(height: 36),
                      Opacity(
                        opacity: dots.value,
                        child: _Dots(progress: _loop.value),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// Three soft rings expanding from the centre, like an arrival chime.
class _RipplePainter extends CustomPainter {
  _RipplePainter({required this.progress, required this.opacity});
  final double progress;
  final double opacity;

  @override
  void paint(Canvas canvas, Size size) {
    if (opacity <= 0) return;
    final center = Offset(size.width / 2, size.height / 2 - 60);
    final maxRadius = size.shortestSide * 0.75;
    for (var i = 0; i < 3; i++) {
      final t = (progress + i / 3) % 1;
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..color = Colors.white.withValues(alpha: 0.22 * (1 - t) * opacity);
      canvas.drawCircle(center, 70 + maxRadius * Curves.easeOut.transform(t), paint);
    }
  }

  @override
  bool shouldRepaint(_RipplePainter old) => old.progress != progress || old.opacity != opacity;
}

class _Dots extends StatelessWidget {
  const _Dots({required this.progress});
  final double progress;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      for (var i = 0; i < 3; i++)
        Builder(
          builder: (context) {
            final t = math.sin(((progress - i * 0.18) % 1) * math.pi).clamp(0.0, 1.0);
            return Container(
              margin: const EdgeInsets.symmetric(horizontal: 5),
              width: 9,
              height: 9,
              transform: Matrix4.translationValues(0, -6 * t, 0),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.45 + 0.55 * t),
                shape: BoxShape.circle,
              ),
            );
          },
        ),
    ],
  );
}

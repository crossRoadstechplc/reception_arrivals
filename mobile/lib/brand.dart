import 'dart:ui' show PathMetric;

import 'package:flutter/material.dart';

import 'theme.dart';

/// The logo's "A", drawn stroke by stroke, then its underline.
class BrandLogoPainter extends CustomPainter {
  const BrandLogoPainter({this.strokes = 1, this.underline = 1, this.color = Colors.white});
  final double strokes;
  final double underline;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 64;
    canvas.scale(s);
    Paint pen(double width, [double alpha = 1]) => Paint()
      ..color = color.withValues(alpha: alpha)
      ..style = PaintingStyle.stroke
      ..strokeWidth = width
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    // Underline sweeps out from the middle.
    if (underline > 0) {
      final half = 18 * underline;
      canvas.drawLine(Offset(32 - half, 50), Offset(32 + half, 50), pen(4, 0.6));
    }

    // The two legs (one path), then the crossbar.
    final legs = Path()
      ..moveTo(20, 43)
      ..lineTo(32, 18)
      ..lineTo(44, 43);
    final bar = Path()
      ..moveTo(25.5, 34)
      ..lineTo(38.5, 34);
    _drawPartial(canvas, legs, (strokes / 0.75).clamp(0, 1), pen(5.5));
    _drawPartial(canvas, bar, ((strokes - 0.7) / 0.3).clamp(0, 1), pen(5));
  }

  void _drawPartial(Canvas canvas, Path path, double t, Paint paint) {
    if (t <= 0) return;
    for (final PathMetric metric in path.computeMetrics()) {
      canvas.drawPath(metric.extractPath(0, metric.length * t), paint);
    }
  }

  @override
  bool shouldRepaint(BrandLogoPainter old) => old.strokes != strokes || old.underline != underline;
}

/// Home banner: "Arrival Desk", then this floor and its company in large type.
class BrandBanner extends StatelessWidget {
  const BrandBanner({super.key, required this.headline, this.canSwitch = false});

  /// Floor and company, e.g. "6th Floor · SPX".
  final String headline;

  /// Shows an arrow when the person works on several floors.
  final bool canSwitch;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: 'Arrival Desk. $headline',
      child: ExcludeSemantics(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
          decoration: BoxDecoration(
            color: AppColors.panel,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            children: [
              Container(
                width: 68,
                height: 68,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0xFFE46A37), Color(0xFFC94F20)],
                  ),
                ),
                child: const CustomPaint(painter: BrandLogoPainter()),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'Arrival Desk',
                      style: TextStyle(
                        color: AppColors.signalDeep,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      headline,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.ink,
                        fontSize: 26,
                        height: 1.15,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.3,
                      ),
                    ),
                  ],
                ),
              ),
              if (canSwitch) const Icon(Icons.arrow_drop_down, color: AppColors.ink, size: 28),
            ],
          ),
        ),
      ),
    );
  }
}

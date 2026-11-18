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

/// The home page banner: the logo with this floor's company, the person and their role.
class BrandBanner extends StatelessWidget {
  const BrandBanner({super.key, required this.title, required this.role, this.subtitle, this.canSwitch = false});

  /// The company on this floor (or the floor's name if it has no company).
  final String title;

  /// The account holder's name and floor, e.g. "Dawit Tefera · 6th Floor".
  final String? subtitle;

  /// "Floor admin" or "Floor staff".
  final String role;

  /// Shows an arrow when the person works on several floors.
  final bool canSwitch;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: [title, ?subtitle, role].join('. '),
      child: ExcludeSemantics(
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.panel,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(15),
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
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.ink,
                              fontSize: 22,
                              height: 1.15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.signalSoft,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            role,
                            style: const TextStyle(
                              color: AppColors.signalDeep,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (subtitle != null && subtitle!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppColors.muted, fontSize: 13.5),
                      ),
                    ],
                  ],
                ),
              ),
              if (canSwitch) const Icon(Icons.arrow_drop_down, color: AppColors.ink, size: 26),
            ],
          ),
        ),
      ),
    );
  }
}

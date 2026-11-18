/// Data from the /api/mobile routes. Time text (e.g. "2:30 PM") is made on the
/// server, so every phone shows the same thing whatever its clock settings.
library;

class AppUser {
  AppUser({required this.id, this.name, this.email});
  final String id;
  final String? name;
  final String? email;

  String get displayName => (name?.trim().isNotEmpty ?? false) ? name!.trim() : (email ?? 'You');

  factory AppUser.fromJson(Map<String, dynamic> json) =>
      AppUser(id: json['id'] as String, name: json['name'] as String?, email: json['email'] as String?);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'email': email};
}

class Floor {
  Floor({
    required this.id,
    required this.name,
    required this.number,
    required this.role,
    this.roomBookingAvailable = false,
    this.roomBookingOn = false,
  });
  final String id;

  /// The floor is connected to a booking system, so its admin can switch booking on.
  final bool roomBookingAvailable;

  /// Booking is switched on: the guest form offers a meeting room.
  final bool roomBookingOn;

  /// "6th Floor · SPX" (floor name and the company on it).
  final String name;
  final int number;

  /// "ADMIN" (sees the whole floor) or "MEMBER" (own guests only).
  final String role;

  bool get isAdmin => role == 'ADMIN';
  String get roleLabel => isAdmin ? 'Floor admin' : 'Floor staff';

  /// "6th Floor" from "6th Floor · SPX".
  String get floorName => name.split(' · ').first;

  /// "SPX" from "6th Floor · SPX", or null when the floor has no company set.
  String? get company {
    final at = name.indexOf(' · ');
    return at < 0 ? null : name.substring(at + 3);
  }

  factory Floor.fromJson(Map<String, dynamic> json) => Floor(
    id: json['id'] as String,
    name: json['name'] as String,
    number: (json['number'] as num).toInt(),
    role: json['role'] as String,
    roomBookingAvailable: json['roomBookingAvailable'] as bool? ?? false,
    roomBookingOn: json['roomBookingOn'] as bool? ?? false,
  );
}

/// The meeting room for a visit, or why it couldn't be booked.
class GuestBooking {
  GuestBooking({required this.booked, this.roomId, this.roomName, this.minutes, this.timeLabel, this.problem});
  final bool booked;
  final String? roomId;
  final String? roomName;
  final int? minutes;
  final String? timeLabel;
  final String? problem;

  factory GuestBooking.fromJson(Map<String, dynamic> json) => GuestBooking(
    booked: json['booked'] as bool? ?? false,
    roomId: json['roomId'] as String?,
    roomName: json['roomName'] as String?,
    minutes: (json['minutes'] as num?)?.toInt(),
    timeLabel: json['timeLabel'] as String?,
    problem: json['problem'] as String?,
  );
}

/// A time already taken in a meeting room.
class BusySlot {
  BusySlot({required this.from, required this.to, required this.label});
  final String from;
  final String to;
  final String label;

  static int _minutes(String hhmm) {
    final parts = hhmm.split(':');
    return int.parse(parts[0]) * 60 + int.parse(parts[1]);
  }

  int get fromMinutes => _minutes(from);
  int get toMinutes => _minutes(to);

  factory BusySlot.fromJson(Map<String, dynamic> json) =>
      BusySlot(from: json['from'] as String, to: json['to'] as String, label: json['label'] as String);
}

/// A meeting room and the times already taken on one day.
class RoomOption {
  RoomOption({required this.id, required this.name, this.location, this.capacity, this.busy = const []});
  final String id;
  final String name;
  final String? location;
  final int? capacity;
  final List<BusySlot> busy;

  factory RoomOption.fromJson(Map<String, dynamic> json) => RoomOption(
    id: json['id'] as String,
    name: json['name'] as String,
    location: json['location'] as String?,
    capacity: (json['capacity'] as num?)?.toInt(),
    busy: ((json['busy'] as List?) ?? const []).map((e) => BusySlot.fromJson(e as Map<String, dynamic>)).toList(),
  );
}

/// What happened to the meeting room when a guest was saved.
class BookingOutcome {
  BookingOutcome({required this.kind, required this.message});

  /// booked, taken, failed or cancelled.
  final String kind;
  final String message;

  bool get isProblem => kind == 'taken' || kind == 'failed';
  String get title => kind == 'taken' ? 'Room taken' : 'Room not booked';

  static BookingOutcome? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    return BookingOutcome(kind: json['kind'] as String, message: json['message'] as String);
  }
}

class Host {
  Host({required this.id, required this.name});
  final String id;
  final String name;
  factory Host.fromJson(Map<String, dynamic> json) => Host(id: json['id'] as String, name: json['name'] as String);
}

enum GuestKind { expected, late, arrived, gone, missed }

class Guest {
  Guest({
    required this.id,
    required this.visitDate,
    required this.guestName,
    required this.hostName,
    required this.status,
    required this.mine,
    required this.canEdit,
    this.company,
    this.hostUserId,
    this.expectedArrival,
    this.expectedLabel,
    this.checkedInLabel,
    this.notes,
    this.licensePlate,
    this.vehicle,
    this.notifyUsers = const [],
    this.invited = false,
    this.booking,
  });

  /// The meeting room for this visit, if one was asked for.
  final GuestBooking? booking;

  final String id;
  final String visitDate;
  final String guestName;
  final String? company;
  final String hostName;
  final String? hostUserId;

  /// "14:30" (24-hour) or null for "any time".
  final String? expectedArrival;
  final String? expectedLabel;
  final String? checkedInLabel;

  /// EXPECTED, ARRIVED, CLEARED, CANCELLED or NO_SHOW.
  final String status;
  final String? notes;
  final String? licensePlate;
  final String? vehicle;
  final bool mine;
  final bool canEdit;

  /// Colleagues on the "Also notify" list.
  final List<Host> notifyUsers;

  /// You see this guest only because you're on its "Also notify" list.
  final bool invited;

  bool get checkedIn => status == 'ARRIVED' || status == 'CLEARED';
  bool get notComing => status == 'CANCELLED' || status == 'NO_SHOW';
  bool get hasCar => (licensePlate?.isNotEmpty ?? false) || (vehicle?.isNotEmpty ?? false);

  /// Same rule as the website: once reception checked them in (or it's off), no edits.
  bool get editable => canEdit && (status == 'EXPECTED' || status == 'ARRIVED');

  /// Minutes since midnight of the expected time, or null.
  int? get expectedMinutes {
    final value = expectedArrival;
    if (value == null) return null;
    final parts = value.split(':');
    if (parts.length != 2) return null;
    final h = int.tryParse(parts[0]);
    final m = int.tryParse(parts[1]);
    return h == null || m == null ? null : h * 60 + m;
  }

  GuestKind kind({required String today, required int nowMinutes}) {
    if (checkedIn) return GuestKind.arrived;
    if (notComing) return GuestKind.gone;
    // The day has passed and reception never checked them in.
    if (visitDate.compareTo(today) < 0) return GuestKind.missed;
    final expected = expectedMinutes;
    if (visitDate == today && expected != null && expected < nowMinutes) return GuestKind.late;
    return GuestKind.expected;
  }

  String get statusLabel => switch (status) {
    'ARRIVED' || 'CLEARED' => 'Checked in',
    'CANCELLED' => 'Cancelled',
    'NO_SHOW' => 'No-show',
    _ => 'Expected',
  };

  factory Guest.fromJson(Map<String, dynamic> json) => Guest(
    id: json['id'] as String,
    visitDate: json['visitDate'] as String,
    guestName: json['guestName'] as String,
    company: json['company'] as String?,
    hostName: json['hostName'] as String,
    hostUserId: json['hostUserId'] as String?,
    expectedArrival: json['expectedArrival'] as String?,
    expectedLabel: json['expectedLabel'] as String?,
    checkedInLabel: json['checkedInLabel'] as String?,
    status: json['status'] as String,
    notes: json['notes'] as String?,
    licensePlate: json['licensePlate'] as String?,
    vehicle: json['vehicle'] as String?,
    mine: json['mine'] as bool? ?? false,
    canEdit: json['canEdit'] as bool? ?? false,
    notifyUsers: ((json['notifyUsers'] as List?) ?? const [])
        .map((e) => Host.fromJson(e as Map<String, dynamic>))
        .toList(),
    invited: json['invited'] as bool? ?? false,
    booking: json['booking'] == null ? null : GuestBooking.fromJson(json['booking'] as Map<String, dynamic>),
  );
}

class GuestRange {
  GuestRange({
    required this.today,
    required this.officeMinutes,
    required this.floor,
    required this.hosts,
    required this.guests,
    this.people = const [],
  });

  final String today;

  /// Office time when the server answered, in minutes since midnight.
  final int officeMinutes;
  final Floor floor;
  final List<Host> hosts;
  final List<Guest> guests;

  /// Everyone on the floor, for "Also notify".
  final List<Host> people;

  factory GuestRange.fromJson(Map<String, dynamic> json) => GuestRange(
    today: json['today'] as String,
    officeMinutes: (json['officeMinutes'] as num).toInt(),
    floor: Floor.fromJson(json['floor'] as Map<String, dynamic>),
    hosts: (json['hosts'] as List).map((e) => Host.fromJson(e as Map<String, dynamic>)).toList(),
    guests: (json['guests'] as List).map((e) => Guest.fromJson(e as Map<String, dynamic>)).toList(),
    people: ((json['people'] as List?) ?? const []).map((e) => Host.fromJson(e as Map<String, dynamic>)).toList(),
  );
}

class Me {
  Me({
    required this.user,
    required this.floors,
    required this.today,
    required this.alertsAvailable,
    this.token,
    this.realtimeUrl,
    this.realtimeKey,
  });
  final AppUser user;
  final List<Floor> floors;
  final String today;
  final bool alertsAvailable;

  /// A renewed sign-in token, so people who use the app stay signed in.
  final String? token;

  /// Where to connect for live updates, when the server offers them.
  final String? realtimeUrl;
  final String? realtimeKey;

  factory Me.fromJson(Map<String, dynamic> json) => Me(
    user: AppUser.fromJson(json['user'] as Map<String, dynamic>),
    floors: (json['floors'] as List).map((e) => Floor.fromJson(e as Map<String, dynamic>)).toList(),
    today: json['today'] as String,
    alertsAvailable: json['alertsAvailable'] as bool? ?? false,
    token: json['token'] as String?,
    realtimeUrl: (json['realtime'] as Map<String, dynamic>?)?['url'] as String?,
    realtimeKey: (json['realtime'] as Map<String, dynamic>?)?['anonKey'] as String?,
  );
}

/// What the guest form sends. Matches SaveGuestInput on the server.
class GuestInput {
  GuestInput({
    this.id,
    required this.floorId,
    required this.visitDate,
    required this.guestName,
    this.company = '',
    this.hostUserId,
    this.hostName = '',
    this.expectedArrival = '',
    this.notes = '',
    this.licensePlate = '',
    this.vehicle = '',
    this.notifyUserIds = const [],
    this.sendBooking = false,
    this.roomId,
    this.roomMinutes = 60,
  });

  /// Include the meeting room choice. Left out, any booking just follows the visit.
  final bool sendBooking;

  /// The room to book, or null for no room.
  final String? roomId;
  final int roomMinutes;

  final String? id;
  final String floorId;
  final String visitDate;
  final String guestName;
  final String company;
  final String? hostUserId;
  final String hostName;
  final String expectedArrival;
  final String notes;
  final String licensePlate;
  final String vehicle;
  final List<String> notifyUserIds;

  Map<String, dynamic> toJson() => {
    if (id != null) 'id': id,
    'floorId': floorId,
    'visitDate': visitDate,
    'guestName': guestName,
    'company': company,
    if (hostUserId != null) 'hostUserId': hostUserId,
    'hostName': hostName,
    'expectedArrival': expectedArrival,
    'notes': notes,
    'licensePlate': licensePlate,
    'vehicle': vehicle,
    'notifyUserIds': notifyUserIds,
    if (sendBooking) 'booking': roomId == null ? null : {'roomId': roomId, 'minutes': roomMinutes},
  };
}

/// Sentinel the server uses for "someone without an account" as host.
const otherHost = '__other__';

import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

// Must match WalkAttributes in modules/steppool-live/ios/StepPoolLiveModule.swift field for field.
struct WalkAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var status: String
    var distance: String
    var movingMs: Int
    var timerStart: Double
    var speed: String
    var pace: String
    var steps: Int
    var turn: String
    var turnKind: String
    var turnIn: String
  }

  var startedAt: Date
}

/// Pause / resume from the lock screen. This runs in the widget's process, so it leaves the command in
/// the shared App Group and signals the app, which is awake because it is recording.
struct WalkCommandIntent: AppIntent {
  static var title: LocalizedStringResource = "Control walk"
  static var isDiscoverable: Bool = false

  @Parameter(title: "Command")
  var command: String

  init() {}
  init(_ command: String) {
    self.command = command
  }

  func perform() async throws -> some IntentResult {
    UserDefaults(suiteName: "group.com.steppool.app")?.set(command, forKey: "walk.command")
    CFNotificationCenterPostNotification(CFNotificationCenterGetDarwinNotifyCenter(), CFNotificationName("com.steppool.app.walk.command" as CFString), nil, nil, true)
    return .result()
  }
}

private extension WalkAttributes.ContentState {
  var recording: Bool { status == "recording" }
  var finished: Bool { status == "finished" }
  var statusLabel: String {
    switch status {
    case "recording": return "RECORDING"
    case "autopaused": return "AUTO-PAUSED"
    case "finished": return "WALK SAVED"
    default: return "PAUSED"
    }
  }

  var duration: String {
    let s = max(0, movingMs / 1000)
    return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
  }

  var turnSymbol: String {
    switch turnKind {
    case "left", "sharp left": return "arrow.turn.up.left"
    case "right", "sharp right": return "arrow.turn.up.right"
    case "slight left": return "arrow.up.left"
    case "slight right": return "arrow.up.right"
    case "uturn": return "arrow.uturn.down"
    case "arrive": return "flag.checkered"
    case "off": return "exclamationmark.triangle.fill"
    case "roundabout": return "arrow.triangle.2.circlepath"
    default: return "arrow.up"
    }
  }
}

/// Moving time. While recording it ticks by itself between updates from the app.
private struct WalkTimer: View {
  let state: WalkAttributes.ContentState

  var body: some View {
    if state.recording {
      Text(timerInterval: Date(timeIntervalSince1970: state.timerStart / 1000)...Date.distantFuture, countsDown: false)
        .monospacedDigit()
    } else {
      Text(state.duration).monospacedDigit()
    }
  }
}

private struct Stat: View {
  let value: String
  let label: String

  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(value).font(.system(size: 17, weight: .semibold, design: .rounded)).monospacedDigit().foregroundStyle(Color("ink"))
      Text(label).font(.system(size: 9, weight: .semibold)).tracking(0.8).foregroundStyle(Color("muted"))
    }
  }
}

private struct TurnRow: View {
  let state: WalkAttributes.ContentState

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: state.turnSymbol).font(.system(size: 15, weight: .bold)).foregroundStyle(Color(state.turnKind == "off" ? "gold" : "volt"))
      if !state.turnIn.isEmpty {
        Text(state.turnIn).font(.system(size: 14, weight: .bold, design: .rounded)).monospacedDigit().foregroundStyle(Color("ink"))
      }
      Text(state.turn).font(.system(size: 13, weight: .medium)).foregroundStyle(Color("ink")).lineLimit(1)
      Spacer(minLength: 0)
    }
  }
}

private struct ControlButton: View {
  let state: WalkAttributes.ContentState

  var body: some View {
    Button(intent: WalkCommandIntent(state.recording ? "pause" : "resume")) {
      Label(state.recording ? "Pause" : "Resume", systemImage: state.recording ? "pause.fill" : "play.fill")
        .font(.system(size: 13, weight: .semibold))
        .padding(.horizontal, 6)
    }
    .tint(Color(state.recording ? "track" : "volt"))
    .foregroundStyle(Color(state.recording ? "ink" : "bg"))
    .buttonBorderShape(.capsule)
  }
}

private struct LockScreenView: View {
  let context: ActivityViewContext<WalkAttributes>

  var body: some View {
    let s = context.state
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline) {
        Text("STEPPOOL").font(.system(size: 11, weight: .bold)).tracking(2.5).foregroundStyle(Color("volt"))
        Spacer()
        HStack(spacing: 5) {
          if s.recording && !context.isStale {
            Circle().fill(Color("volt")).frame(width: 6, height: 6)
          }
          Text(context.isStale && !s.finished ? "OPEN STEPPOOL TO UPDATE" : s.statusLabel)
            .font(.system(size: 10, weight: .semibold)).tracking(1).foregroundStyle(Color("muted"))
        }
      }
      HStack(alignment: .lastTextBaseline, spacing: 6) {
        Text(s.distance).font(.system(size: 40, weight: .bold, design: .rounded)).monospacedDigit().foregroundStyle(Color(s.finished ? "gold" : "ink"))
        Text("km").font(.system(size: 15, weight: .semibold)).foregroundStyle(Color("muted"))
        Spacer()
        WalkTimer(state: s).font(.system(size: 24, weight: .semibold, design: .rounded)).foregroundStyle(Color("ink")).multilineTextAlignment(.trailing)
      }
      HStack(spacing: 18) {
        Stat(value: s.speed, label: "KM/H")
        Stat(value: s.pace, label: "PACE /KM")
        if s.steps > 0 {
          Stat(value: s.steps.formatted(), label: "STEPS")
        }
        Spacer()
        if !s.finished {
          ControlButton(state: s)
        }
      }
      if !s.turn.isEmpty && !s.finished {
        Divider().overlay(Color("track"))
        TurnRow(state: s)
      }
    }
    .padding(16)
    .activityBackgroundTint(Color("bg"))
    .activitySystemActionForegroundColor(Color("ink"))
  }
}

struct WalkLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: WalkAttributes.self) { context in
      LockScreenView(context: context)
        .widgetURL(URL(string: "steppool://walk"))
    } dynamicIsland: { context in
      let s = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .lastTextBaseline, spacing: 3) {
              Text(s.distance).font(.system(size: 26, weight: .bold, design: .rounded)).monospacedDigit()
              Text("km").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color("muted"))
            }
            Text(s.statusLabel).font(.system(size: 9, weight: .semibold)).tracking(0.8).foregroundStyle(Color(s.recording ? "volt" : "muted"))
          }
          .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          VStack(alignment: .trailing, spacing: 0) {
            WalkTimer(state: s).font(.system(size: 22, weight: .semibold, design: .rounded)).multilineTextAlignment(.trailing)
            Text("\(s.speed) km/h").font(.system(size: 11, weight: .medium)).monospacedDigit().foregroundStyle(Color("muted"))
          }
          .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(spacing: 8) {
            if !s.turn.isEmpty && !s.finished {
              TurnRow(state: s)
            }
            HStack(spacing: 16) {
              Stat(value: s.pace, label: "PACE /KM")
              if s.steps > 0 {
                Stat(value: s.steps.formatted(), label: "STEPS")
              }
              Spacer()
              if !s.finished {
                ControlButton(state: s)
              }
            }
          }
          .padding(.horizontal, 4)
        }
      } compactLeading: {
        HStack(spacing: 4) {
          Image(systemName: s.turn.isEmpty || s.finished ? "figure.walk" : s.turnSymbol).foregroundStyle(Color("volt"))
          Text(s.turn.isEmpty || s.turnIn.isEmpty ? s.distance : s.turnIn).font(.system(size: 13, weight: .semibold, design: .rounded)).monospacedDigit()
        }
      } compactTrailing: {
        WalkTimer(state: s).font(.system(size: 13, weight: .semibold, design: .rounded)).frame(maxWidth: 52).multilineTextAlignment(.trailing)
      } minimal: {
        Image(systemName: s.recording ? "figure.walk" : "pause.fill").foregroundStyle(Color("volt"))
      }
      .widgetURL(URL(string: "steppool://walk"))
      .keylineTint(Color("volt"))
    }
  }
}

import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { sGet, sSet } from './lib/storage'

// ── Date utils ────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split('T')[0]
const dateStrOff = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().split('T')[0] }
const DAY_MAP = ['sun','mon','tue','wed','thu','fri','sat']
const DAY_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa']

const isScheduledOn = (habit, date) => {
  const idx = date.getDay(), day = DAY_MAP[idx]
  if (habit.schedule === 'daily') return true
  if (habit.schedule === 'weekdays') return idx >= 1 && idx <= 5
  if (habit.schedule === 'weekends') return idx === 0 || idx === 6
  return Array.isArray(habit.schedule) && habit.schedule.includes(day)
}

const getStreak = (habit, completions) => {
  let streak = 0
  for (let i = 0; i <= 180; i++) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const ds = d.toISOString().split('T')[0]
    if (!isScheduledOn(habit, d)) continue
    if ((completions[ds] || []).includes(habit.id)) streak++
    else if (ds !== todayStr()) break
  }
  return streak
}

const getWeekData = (habits, completions) =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 6 + i)
    const ds = d.toISOString().split('T')[0]
    const scheduled = habits.filter(h => isScheduledOn(h, d))
    const doneCount = (completions[ds] || []).filter(id => scheduled.find(h => h.id === id)).length
    return { ds, dayIdx: d.getDay(), isToday: ds === todayStr(), pct: scheduled.length === 0 ? -1 : doneCount / scheduled.length }
  })

const getWeeklyScore = (habits, completions) => {
  let total = 0, done = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const ds = d.toISOString().split('T')[0]
    const scheduled = habits.filter(h => isScheduledOn(h, d))
    total += scheduled.length
    done += (completions[ds] || []).filter(id => scheduled.find(h => h.id === id)).length
  }
  return { total, done, pct: total === 0 ? 0 : Math.round((done / total) * 100) }
}

// ── Design tokens ─────────────────────────────────────────────
const C = {
  bg:'#F7F5F2', surface:'#FFFFFF', border:'#E2DDD8', borderMd:'#C8C2BA',
  textHi:'#1A1714', textMd:'#4A4540', textLo:'#8C857D',
  accent:'#D4622A', accentLt:'#FBE9E0',
  green:'#2A7A4B', greenLt:'#D6F0E2',
  blue:'#1D5FA8', blueLt:'#DDEAF8',
  purple:'#6B3FA0', purpleLt:'#EDE5F8',
  pink:'#B53070', pinkLt:'#FAE0EE',
  yellow:'#946A00', yellowLt:'#FDF3D0',
  red:'#C0321A', redLt:'#FCE4DE',
  navBg:'#FFFFFF', navBorder:'#E2DDD8',
}

const CAT_COLORS = {
  Fitness:  { fg:C.accent, bg:C.accentLt },
  Diet:     { fg:C.green,  bg:C.greenLt  },
  Study:    { fg:C.blue,   bg:C.blueLt   },
  Health:   { fg:C.pink,   bg:C.pinkLt   },
  Mind:     { fg:C.purple, bg:C.purpleLt },
  Personal: { fg:C.yellow, bg:C.yellowLt },
}
const GOAL_COLORS = { Fitness:'#D4622A', Diet:'#2A7A4B', Learning:'#1D5FA8', Career:'#6B3FA0', Personal:'#946A00', Travel:'#2A7A4B' }
const BOOK_COLORS = { reading:C.accent, finished:C.green, paused:C.textLo, want:C.blue }
const SCHEDULES = [
  { value:'daily', label:'Every day' },
  { value:'weekdays', label:'Weekdays (Mon-Fri)' },
  { value:'weekends', label:'Weekends' },
  { value:'custom', label:'Custom days' },
]
const TIME_SLOTS = ['Morning','Midday','Evening','Anytime']
const GOAL_CATS  = ['Fitness','Diet','Learning','Career','Personal','Travel']
const K = { habits:'rt:habits', completions:'rt:completions', books:'rt:books', goals:'rt:goals', identity:'rt:identity' }
const JOURNAL_KEY = (ds) => `rt:journal:${ds}`
const JOURNAL_IDX = 'rt:journal:index'

const MOOD_OPTIONS = [
  { emoji:'😄', label:'Great',   color:'#2A7A4B' },
  { emoji:'🙂', label:'Good',    color:'#4D8A2A' },
  { emoji:'😐', label:'Neutral', color:'#946A00' },
  { emoji:'😔', label:'Low',     color:'#D4622A' },
  { emoji:'😤', label:'Stressed',color:'#B53070' },
]
const PROMPT_SETS = {
  gratitude:  { label:'Gratitude',  color:'#2A7A4B', bg:'#D6F0E2', science:'Emmons & McCullough (2003): writing 3 specific things you\'re grateful for weekly raised wellbeing by 25% and improved sleep. Specificity matters.', prompts:['What are 3 specific things you\'re grateful for today?','Who made your day slightly better, and how?','What\'s something small you usually overlook that you appreciated today?'] },
  expressive: { label:'Expressive', color:'#1D5FA8', bg:'#DDEAF8', science:'Pennebaker (UT Austin, 1986): writing freely about thoughts and feelings for 15–20 min reduces cortisol, strengthens immune function, and processes emotional residue.', prompts:['What\'s on your mind right now? Don\'t filter it.','What\'s something you\'ve been avoiding thinking about?','If you could say anything to anyone today, what would it be?'] },
  reflection: { label:'Reflection', color:'#6B3FA0', bg:'#EDE5F8', science:'Weekly self-review (used in CBT and executive coaching) builds metacognition — the ability to observe your own patterns. People who reflect regularly course-correct faster.', prompts:['What went well today, and why?','What didn\'t go as planned? What would you do differently?','What did you learn about yourself today?'] },
  intention:  { label:'Intentions', color:'#D4622A', bg:'#FBE9E0', science:'Gollwitzer\'s implementation intentions: writing specific plans for tomorrow increases follow-through by up to 91%. Specifics beat vague goals.', prompts:['What are your 3 most important tasks for tomorrow?','What\'s one thing you\'ll do differently tomorrow?','How do you want to feel at the end of tomorrow, and what would get you there?'] },
}

// ── Shared UI ─────────────────────────────────────────────────
const Label = ({ children, style }) =>
  <p style={{ fontSize:'10px', fontWeight:700, color:C.textLo, letterSpacing:'0.12em', marginBottom:'8px', textTransform:'uppercase', ...style }}>{children}</p>

const Tag = ({ fg, bg, children }) =>
  <span style={{ display:'inline-block', padding:'3px 9px', borderRadius:'6px', fontSize:'11px', fontWeight:600, background:bg||C.accentLt, color:fg||C.accent }}>{children}</span>

const Empty = ({ icon, l1, l2 }) =>
  <div style={{ textAlign:'center', padding:'56px 20px' }}>
    <p style={{ fontSize:'36px', marginBottom:'12px' }}>{icon}</p>
    <p style={{ fontSize:'14px', color:C.textMd, fontWeight:500 }}>{l1}</p>
    {l2 && <p style={{ fontSize:'12px', color:C.textLo, marginTop:'6px' }}>{l2}</p>}
  </div>

const ProgressBar = ({ pct, color, h=6 }) =>
  <div style={{ background:C.border, borderRadius:'99px', height:`${h}px`, overflow:'hidden' }}>
    <div style={{ width:`${pct}%`, background:color||C.accent, height:'100%', borderRadius:'99px', transition:'width 0.5s ease' }} />
  </div>

const FormBtns = ({ onSave, onCancel, label }) =>
  <div style={{ display:'flex', gap:'10px', marginTop:'4px' }}>
    <button className="btn-primary" style={{ flex:1 }} onClick={onSave}>{label}</button>
    <button className="btn-ghost" onClick={onCancel}>Cancel</button>
  </div>

const DeleteBtn = ({ onClick }) =>
  <button onClick={onClick}
    style={{ background:'none', border:'none', color:C.border, fontSize:'20px', cursor:'pointer', lineHeight:1, padding:'2px 4px', flexShrink:0, transition:'color 0.15s' }}
    onMouseEnter={e => e.currentTarget.style.color=C.red}
    onMouseLeave={e => e.currentTarget.style.color=C.border}>×</button>

function ScienceBadge({ label, why }) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position:'relative', display:'inline-block' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span style={{ display:'inline-flex', alignItems:'center', gap:'3px', padding:'2px 8px', borderRadius:'99px', fontSize:'10px', fontWeight:600, background:C.purpleLt, color:C.purple, cursor:'help', border:`1px solid ${C.purple}33` }}>⚗ {label}</span>
      {show && <span style={{ position:'absolute', bottom:'calc(100% + 8px)', left:'50%', transform:'translateX(-50%)', background:C.textHi, color:'#F7F5F2', borderRadius:'10px', padding:'10px 12px', fontSize:'11px', lineHeight:1.6, zIndex:200, minWidth:'200px', maxWidth:'240px', whiteSpace:'normal', textAlign:'left', boxShadow:'0 8px 24px rgba(0,0,0,0.2)' }}>{why}</span>}
    </span>
  )
}

function Ring({ done, total }) {
  const pct = total === 0 ? 0 : done / total
  const size = 120, stroke = 9, r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const color = pct >= 1 ? C.green : C.accent
  return (
    <div style={{ position:'relative', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} strokeLinecap="round"
          style={{ transition:'stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1), stroke 0.4s' }} />
      </svg>
      <div style={{ position:'absolute', textAlign:'center' }}>
        <p style={{ fontFamily:"'Lora',serif", fontSize:'28px', fontWeight:700, color, lineHeight:1 }}>{done}</p>
        <p style={{ fontSize:'10px', color:C.textLo, marginTop:'2px' }}>of {total}</p>
      </div>
    </div>
  )
}

// ── TODAY ─────────────────────────────────────────────────────
function Today({ habits, completions, saveCompletions, identity, setIdentityRaw }) {
  const today = todayStr(), yesterday = dateStrOff(-1)
  const todayDate = new Date(), hour = todayDate.getHours()
  const todayHabits = habits.filter(h => isScheduledOn(h, todayDate))
  const yesterdayHabits = habits.filter(h => isScheduledOn(h, new Date(yesterday + 'T12:00:00')))
  const doneIds = completions[today] || []
  const doneCount = doneIds.filter(id => todayHabits.find(h => h.id === id)).length
  const allDone = todayHabits.length > 0 && doneCount >= todayHabits.length
  const week = getWeekData(habits, completions)
  const weekly = getWeeklyScore(habits, completions)
  const [showMin, setShowMin] = useState(false)
  const [editId, setEditId] = useState(false)
  const [editIdentity, setEditIdentity] = useState(identity)
  const neverMissTwice = yesterdayHabits.filter(h => !(completions[yesterday] || []).includes(h.id))
  const currentSlot = hour < 12 ? 'Morning' : hour < 15 ? 'Midday' : hour < 21 ? 'Evening' : 'Anytime'
  const groups = TIME_SLOTS.map(slot => ({ slot, items: todayHabits.filter(h => h.timeSlot === slot) })).filter(g => g.items.length > 0)

  const toggle = async (id) => {
    const cur = completions[today] || []
    await saveCompletions({ ...completions, [today]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] })
  }
  const saveIdentity = async () => { setIdentityRaw(editIdentity); await sSet(K.identity, editIdentity); setEditId(false) }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      {/* Identity */}
      <div style={{ padding:'16px', background:C.surface, border:`1.5px solid ${C.accent}40`, borderRadius:'14px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
          <Label style={{ marginBottom:0 }}>Your Identity</Label>
          <ScienceBadge label="Identity-Based" why="James Clear: habits tied to WHO YOU ARE outlast habits tied to what you want. 'I am a martial artist' survives hard days. 'I want to get fit' doesn't." />
        </div>
        {editId ? (
          <div style={{ display:'flex', gap:'8px' }}>
            <input value={editIdentity} onChange={e => setEditIdentity(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveIdentity()} placeholder="I am someone who..." autoFocus />
            <button className="btn-primary" style={{ whiteSpace:'nowrap', padding:'10px 14px' }} onClick={saveIdentity}>Save</button>
          </div>
        ) : (
          <p onClick={() => setEditId(true)} style={{ fontSize:'15px', fontStyle:'italic', color:identity?C.textHi:C.textLo, cursor:'pointer', lineHeight:1.5, fontFamily:"'Lora',serif" }}>
            {identity || 'Tap to set your identity statement…'}
          </p>
        )}
      </div>

      {/* Ring hero */}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'14px', padding:'20px' }}>
        <div style={{ display:'flex', gap:'20px', alignItems:'center' }}>
          <Ring done={doneCount} total={todayHabits.length} />
          <div style={{ flex:1 }}>
            <p style={{ fontFamily:"'Lora',serif", fontSize:'20px', fontWeight:700, color:allDone?C.green:C.textHi, lineHeight:1.3 }}>
              {todayHabits.length===0?'Rest day.':allDone?'All done! 🎉':doneCount===0?'Let\'s get started.':doneCount<todayHabits.length/2?'Good start.':'Almost there.'}
            </p>
            <p style={{ fontSize:'13px', color:C.textMd, marginTop:'4px' }}>
              {todayHabits.length===0?'Nothing scheduled today':`${todayHabits.length-doneCount} left today`}
            </p>
            <div style={{ display:'flex', gap:'5px', marginTop:'16px' }}>
              {week.map(w => (
                <div key={w.ds} style={{ flex:1, textAlign:'center' }}>
                  <div style={{ width:'100%', aspectRatio:'1', borderRadius:'50%', background:w.pct>=1?C.accent:w.pct>0?C.accentLt:w.isToday?C.accentLt:C.bg, border:w.isToday?`2px solid ${C.accent}`:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'4px', transition:'all 0.3s' }}>
                    {w.pct>=1&&<span style={{ fontSize:'8px', color:'#fff', fontWeight:800 }}>✓</span>}
                  </div>
                  <p style={{ fontSize:'8px', fontWeight:w.isToday?700:400, color:w.isToday?C.accent:C.textLo }}>{DAY_SHORT[w.dayIdx][0]}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop:'14px', padding:'10px 12px', background:C.bg, borderRadius:'10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                <p style={{ fontSize:'11px', fontWeight:600, color:C.textMd }}>7-day score</p>
                <ScienceBadge label="Progress" why="Harvard's Amabile & Kramer: seeing measurable progress is the #1 daily motivator. Your % is proof the system is working." />
              </div>
              <p style={{ fontSize:'18px', fontWeight:800, fontFamily:"'Lora',serif", color:weekly.pct>=80?C.green:weekly.pct>=50?C.accent:C.red }}>{weekly.pct}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Never miss twice */}
      {neverMissTwice.length > 0 && (
        <div style={{ padding:'14px 16px', background:C.yellowLt, border:`1.5px solid ${C.yellow}55`, borderRadius:'12px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
            <p style={{ fontSize:'11px', fontWeight:700, color:C.yellow }}>⚠ Missed yesterday</p>
            <ScienceBadge label="Never Miss Twice" why="James Clear: Missing once is an accident. Missing twice starts a new bad habit. Even the minimum today resets the pattern." />
          </div>
          {neverMissTwice.map(h => (
            <p key={h.id} style={{ fontSize:'13px', color:C.textMd, marginBottom:'4px' }}>
              {h.emoji} {h.name}{h.minVersion&&<span style={{ fontSize:'11px', color:C.textLo, marginLeft:'8px' }}>→ min: {h.minVersion}</span>}
            </p>
          ))}
          <p style={{ fontSize:'11px', color:C.yellow, marginTop:'8px', fontWeight:600 }}>Don't miss twice. Even the minimum counts.</p>
        </div>
      )}

      {/* Tough day toggle */}
      {todayHabits.some(h => h.minVersion) && (
        <button onClick={() => setShowMin(v=>!v)}
          style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:showMin?C.blueLt:C.surface, border:`1px solid ${showMin?C.blue:C.border}`, borderRadius:'10px', cursor:'pointer', width:'100%', transition:'all 0.2s' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <p style={{ fontSize:'12px', fontWeight:600, color:showMin?C.blue:C.textMd }}>{showMin?'Showing minimum versions':'Tough day? Show minimums'}</p>
            <ScienceBadge label="Tiny Habits" why="BJ Fogg (Stanford): willpower fluctuates. A pre-set minimum keeps the chain alive on hard days without needing motivation." />
          </div>
          <p style={{ fontSize:'11px', fontWeight:700, color:showMin?C.blue:C.textLo }}>{showMin?'HIDE':'SHOW'}</p>
        </button>
      )}

      {habits.length === 0 && <Empty icon="✦" l1="No habits set up yet" l2="Go to the Habits tab to build your routine." />}

      {groups.map(({ slot, items }) => {
        const isCurrent = slot === currentSlot
        return (
          <div key={slot}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
              <p style={{ fontSize:'11px', fontWeight:700, color:isCurrent?C.accent:C.textLo, letterSpacing:'0.08em' }}>{slot.toUpperCase()}</p>
              {isCurrent && <div style={{ flex:1, height:'2px', background:C.accentLt, borderRadius:'1px' }} />}
              {isCurrent && <span style={{ fontSize:'10px', fontWeight:700, color:C.accent, background:C.accentLt, padding:'2px 8px', borderRadius:'99px' }}>NOW</span>}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {items.map(h => {
                const isDone = doneIds.includes(h.id)
                const streak = getStreak(h, completions)
                const cat = CAT_COLORS[h.category] || { fg:C.accent, bg:C.accentLt }
                const displayName = showMin && h.minVersion ? h.minVersion : h.name
                return (
                  <button key={h.id} onClick={() => toggle(h.id)}
                    style={{ display:'flex', alignItems:'center', gap:'12px', padding:'14px 16px', background:isDone?C.greenLt:C.surface, border:`1.5px solid ${isDone?C.green+'66':C.border}`, borderRadius:'12px', cursor:'pointer', textAlign:'left', width:'100%', transition:'all 0.2s' }}>
                    <div style={{ width:'24px', height:'24px', borderRadius:'50%', border:`2px solid ${isDone?C.green:C.borderMd}`, background:isDone?C.green:'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s' }}>
                      {isDone && <span style={{ fontSize:'11px', color:'#fff', fontWeight:800, lineHeight:1 }}>✓</span>}
                    </div>
                    <span style={{ fontSize:'20px', lineHeight:1 }}>{h.emoji}</span>
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:'14px', fontWeight:600, color:isDone?C.green:C.textHi, textDecoration:isDone?'line-through':'none', lineHeight:1.3, transition:'all 0.2s' }}>
                        {displayName}{showMin&&h.minVersion&&<span style={{ fontSize:'10px', color:C.blue, marginLeft:'8px', fontWeight:600, textDecoration:'none' }}>MIN</span>}
                      </p>
                      {h.cue && !isDone && <p style={{ fontSize:'11px', color:C.textLo, marginTop:'3px' }}>After: {h.cue}</p>}
                      {h.bundle && !isDone && <p style={{ fontSize:'11px', color:C.purple, marginTop:'2px' }}>+ {h.bundle}</p>}
                    </div>
                    {streak > 1 && <p style={{ fontSize:'12px', color:streak>=7?C.yellow:C.textLo, fontWeight:600, flexShrink:0 }}>{streak>=7?'🔥 ':''}{streak}d</p>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── HABIT FORM ────────────────────────────────────────────────
function HabitForm({ value, onChange, onSave, onCancel, saveLabel }) {
  const toggleDay = (day) => onChange(f => ({ ...f, customDays: f.customDays.includes(day) ? f.customDays.filter(d => d !== day) : [...f.customDays, day] }))
  const f = value
  const set = (patch) => onChange(prev => ({ ...prev, ...patch }))
  const FG = ({ label, badge, badgeWhy, children }) => (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
        <Label style={{ marginBottom:0 }}>{label}</Label>
        {badge && <ScienceBadge label={badge} why={badgeWhy} />}
      </div>
      {children}
    </div>
  )
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
      <div style={{ display:'flex', gap:'10px' }}>
        <input placeholder="Name your habit *" value={f.name} onChange={e => set({ name:e.target.value })} />
        <input value={f.emoji} onChange={e => set({ emoji:e.target.value })} style={{ width:'54px', textAlign:'center', fontSize:'22px', padding:'8px', flexShrink:0 }} />
      </div>
      <FG label="Category">
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
          {Object.entries(CAT_COLORS).map(([cat,{fg,bg}]) => (
            <button key={cat} onClick={() => set({ category:cat })}
              style={{ padding:'6px 14px', border:`1.5px solid ${f.category===cat?fg:C.border}`, borderRadius:'99px', background:f.category===cat?bg:'transparent', color:f.category===cat?fg:C.textMd, fontSize:'12px', fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
              {cat}
            </button>
          ))}
        </div>
      </FG>
      <select value={f.schedule} onChange={e => set({ schedule:e.target.value })}>
        {SCHEDULES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      {f.schedule === 'custom' && (
        <div style={{ display:'flex', gap:'6px' }}>
          {DAY_MAP.map((d,i) => { const sel=f.customDays.includes(d); const {fg,bg}=CAT_COLORS[f.category]||{fg:C.accent,bg:C.accentLt}; return <button key={d} onClick={() => toggleDay(d)} style={{ flex:1, padding:'8px 2px', border:`1.5px solid ${sel?fg:C.border}`, borderRadius:'8px', background:sel?bg:'transparent', color:sel?fg:C.textMd, fontSize:'11px', fontWeight:600, cursor:'pointer' }}>{DAY_SHORT[i]}</button> })}
        </div>
      )}
      <FG label="Time of Day">
        <div style={{ display:'flex', gap:'6px' }}>
          {TIME_SLOTS.map(t => <button key={t} onClick={() => set({ timeSlot:t })} style={{ flex:1, padding:'8px 4px', border:`1.5px solid ${f.timeSlot===t?C.accent:C.border}`, borderRadius:'8px', background:f.timeSlot===t?C.accentLt:'transparent', color:f.timeSlot===t?C.accent:C.textMd, fontSize:'11px', fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>{t}</button>)}
        </div>
      </FG>
      <FG label="Trigger / Cue" badge="Implementation Intention" badgeWhy="Gollwitzer (1999): 'I will do X AFTER Y' increases follow-through by up to 91%.">
        <input placeholder="e.g. after my morning coffee…" value={f.cue} onChange={e => set({ cue:e.target.value })} />
      </FG>
      <FG label="Minimum Version" badge="Tiny Habits" badgeWhy="BJ Fogg (Stanford): a pre-set minimum eliminates the all-or-nothing trap. The habit IS the minimum.">
        <input placeholder="e.g. 10 min instead of 1hr…" value={f.minVersion} onChange={e => set({ minVersion:e.target.value })} />
      </FG>
      <FG label="Temptation Bundle" badge="Temptation Bundling" badgeWhy="Milkman (Wharton): pairing a 'want-to' with a 'need-to' boosts compliance significantly.">
        <input placeholder="e.g. only listen to my podcast while running…" value={f.bundle} onChange={e => set({ bundle:e.target.value })} />
      </FG>
      <FormBtns onSave={onSave} onCancel={onCancel} label={saveLabel} />
    </div>
  )
}

// ── HABITS ────────────────────────────────────────────────────
function Habits({ habits, completions, saveHabits }) {
  const blank = { name:'', category:'Fitness', schedule:'daily', customDays:[], timeSlot:'Anytime', emoji:'⭐', cue:'', minVersion:'', bundle:'' }
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(blank)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(null)

  const addHabit = async () => {
    if (!form.name.trim()) return
    const schedule = form.schedule==='custom'?(form.customDays.length?form.customDays:['mon']):form.schedule
    const { customDays, ...rest } = form
    await saveHabits([...habits, { ...rest, schedule, id:Date.now().toString() }])
    setForm(blank); setShowForm(false)
  }
  const startEdit = (h) => { setEditingId(h.id); setEditForm({ ...h, schedule:Array.isArray(h.schedule)?'custom':h.schedule, customDays:Array.isArray(h.schedule)?h.schedule:[] }); setShowForm(false) }
  const saveEdit = async () => {
    if (!editForm.name.trim()) return
    const schedule = editForm.schedule==='custom'?(editForm.customDays.length?editForm.customDays:['mon']):editForm.schedule
    const { customDays, ...rest } = editForm
    await saveHabits(habits.map(h => h.id===editingId?{ ...rest, schedule, id:h.id }:h))
    setEditingId(null); setEditForm(null)
  }
  const remove = async (id) => saveHabits(habits.filter(h => h.id!==id))
  const schedLabel = h => { if(h.schedule==='daily')return'Every day'; if(h.schedule==='weekdays')return'Mon–Fri'; if(h.schedule==='weekends')return'Weekends'; if(Array.isArray(h.schedule))return h.schedule.map(d=>d.charAt(0).toUpperCase()+d.slice(1,3)).join(', '); return h.schedule }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <p style={{ fontFamily:"'Lora',serif", fontSize:'22px', fontWeight:700, color:C.textHi }}>My Habits</p>
        <button className="btn-primary" onClick={() => { setShowForm(v=>!v); setEditingId(null) }}>+ Add habit</button>
      </div>
      {showForm && (
        <div style={{ background:C.surface, border:`1.5px solid ${C.accent}55`, borderRadius:'14px', padding:'20px' }} className="fade-in">
          <Label>New Habit</Label>
          <HabitForm value={form} onChange={setForm} onSave={addHabit} onCancel={() => { setShowForm(false); setForm(blank) }} saveLabel="Add Habit" />
        </div>
      )}
      {habits.length===0&&!showForm&&<Empty icon="◉" l1="No habits defined yet" l2="Set them up once. Show up every day." />}
      {Object.entries(CAT_COLORS).map(([cat,{fg}]) => {
        const catHabits = habits.filter(h=>h.category===cat)
        if (!catHabits.length) return null
        return (
          <div key={cat}>
            <Label style={{ color:fg }}>{cat}</Label>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {catHabits.map(h => {
                const streak = getStreak(h, completions)
                const isEditing = editingId===h.id
                const {fg:hfg}=CAT_COLORS[h.category]||{fg:C.accent}
                return (
                  <div key={h.id} style={{ background:C.surface, border:`1.5px solid ${isEditing?hfg+'66':C.border}`, borderRadius:'12px', overflow:'hidden', transition:'border-color 0.2s' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'14px 16px' }}>
                      <span style={{ fontSize:'20px' }}>{h.emoji}</span>
                      <div style={{ flex:1 }}>
                        <p style={{ fontSize:'14px', fontWeight:600, color:C.textHi }}>{h.name}</p>
                        <p style={{ fontSize:'11px', color:C.textLo, marginTop:'2px' }}>{schedLabel(h)} · {h.timeSlot}</p>
                        {(h.cue||h.minVersion||h.bundle)&&!isEditing&&(
                          <div style={{ display:'flex', gap:'6px', marginTop:'6px', flexWrap:'wrap' }}>
                            {h.cue&&<span style={{ fontSize:'10px', color:C.textLo, background:C.bg, border:`1px solid ${C.border}`, borderRadius:'6px', padding:'2px 7px' }}>After: {h.cue}</span>}
                            {h.minVersion&&<span style={{ fontSize:'10px', color:C.blue, background:C.blueLt, borderRadius:'6px', padding:'2px 7px' }}>Min: {h.minVersion}</span>}
                            {h.bundle&&<span style={{ fontSize:'10px', color:C.purple, background:C.purpleLt, borderRadius:'6px', padding:'2px 7px' }}>+ {h.bundle}</span>}
                          </div>
                        )}
                      </div>
                      <div style={{ display:'flex', gap:'6px', alignItems:'center', flexShrink:0 }}>
                        {streak>0&&!isEditing&&<span style={{ fontSize:'12px', fontWeight:700, color:streak>=7?C.yellow:C.textLo }}>{streak>=7?'🔥 ':''}{streak}d</span>}
                        <button onClick={() => isEditing?( setEditingId(null),setEditForm(null) ):startEdit(h)}
                          style={{ background:isEditing?C.accentLt:'none', border:`1px solid ${isEditing?C.accent:C.border}`, color:isEditing?C.accent:C.textMd, fontSize:'12px', fontWeight:600, padding:'5px 10px', borderRadius:'8px', cursor:'pointer', transition:'all 0.15s' }}>
                          {isEditing?'Cancel':'Edit'}
                        </button>
                        <DeleteBtn onClick={() => remove(h.id)} />
                      </div>
                    </div>
                    {isEditing&&editForm&&(
                      <div style={{ borderTop:`1px solid ${C.border}`, padding:'16px 16px 20px', background:C.bg }} className="fade-in">
                        <Label style={{ color:hfg }}>Editing: {h.name}</Label>
                        <HabitForm value={editForm} onChange={setEditForm} onSave={saveEdit} onCancel={() => { setEditingId(null); setEditForm(null) }} saveLabel="Save Changes" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── JOURNAL ───────────────────────────────────────────────────
function Journal({ journals, saveJournal }) {
  const today = todayStr()
  const todayEntry = journals[today] || { mood:'', freeText:'', prompts:{}, type:'free' }
  const [entry, setEntry] = useState(todayEntry)
  const [saved, setSaved] = useState(false)
  const [viewDate, setViewDate] = useState(null)
  const [showPractices, setShowPractices] = useState(false)
  const updateEntry = (patch) => { setSaved(false); setEntry(e => ({ ...e, ...patch })) }
  const save = async () => { await saveJournal(today, entry); setSaved(true); setTimeout(() => setSaved(false), 2000) }
  const allDates = Object.keys(journals).filter(d => d!==today).sort((a,b)=>b.localeCompare(a))
  const fmtDate = (ds) => new Date(ds+'T12:00:00').toLocaleDateString('en-AU',{ weekday:'long', day:'numeric', month:'long' })
  const wordCount = (text) => text?.trim().split(/\s+/).filter(Boolean).length||0

  if (viewDate && journals[viewDate]) {
    const e = journals[viewDate]; const mood=MOOD_OPTIONS.find(m=>m.label===e.mood); const ps=PROMPT_SETS[e.type]
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <button onClick={() => setViewDate(null)} style={{ background:'none', border:`1px solid ${C.border}`, color:C.textMd, padding:'7px 12px', borderRadius:'8px', fontSize:'13px', cursor:'pointer', fontWeight:600 }}>← Back</button>
          <p style={{ fontFamily:"'Lora',serif", fontSize:'16px', fontWeight:700, color:C.textHi }}>{fmtDate(viewDate)}</p>
        </div>
        {mood&&<div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 14px', background:C.surface, border:`1px solid ${C.border}`, borderRadius:'10px' }}><span style={{ fontSize:'22px' }}>{mood.emoji}</span><p style={{ fontSize:'13px', fontWeight:600, color:mood.color }}>{mood.label}</p></div>}
        {e.freeText&&<div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'12px', padding:'18px' }}>{ps&&<Label style={{ color:ps.color }}>{ps.label}</Label>}<p style={{ fontSize:'14px', lineHeight:1.8, color:C.textHi, fontFamily:"'Lora',serif", whiteSpace:'pre-wrap' }}>{e.freeText}</p><p style={{ fontSize:'11px', color:C.textLo, marginTop:'12px' }}>{wordCount(e.freeText)} words</p></div>}
        {e.prompts&&Object.entries(e.prompts).map(([prompt,answer])=>answer?<div key={prompt} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'12px', padding:'16px' }}><p style={{ fontSize:'11px', fontWeight:700, color:C.textLo, marginBottom:'8px' }}>{prompt}</p><p style={{ fontSize:'14px', lineHeight:1.8, color:C.textHi, fontFamily:"'Lora',serif", whiteSpace:'pre-wrap' }}>{answer}</p></div>:null)}
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <p style={{ fontFamily:"'Lora',serif", fontSize:'22px', fontWeight:700, color:C.textHi }}>Journal</p>
        <button onClick={() => setShowPractices(v=>!v)} style={{ background:showPractices?C.purpleLt:'none', border:`1px solid ${showPractices?C.purple:C.border}`, color:showPractices?C.purple:C.textMd, padding:'7px 12px', borderRadius:'8px', fontSize:'12px', cursor:'pointer', fontWeight:600, transition:'all 0.2s' }}>⚗ Best practices</button>
      </div>
      {showPractices&&(
        <div style={{ background:C.purpleLt, border:`1.5px solid ${C.purple}44`, borderRadius:'14px', padding:'18px' }} className="fade-in">
          <p style={{ fontFamily:"'Lora',serif", fontSize:'16px', fontWeight:700, color:C.purple, marginBottom:'14px' }}>Science-backed journaling practices</p>
          {[{icon:'✍️',title:'Consistency over length',why:'Even 5–10 min daily produces measurable wellbeing benefits (Pennebaker). Short daily beats long sporadic.'},{icon:'🎯',title:'Be specific',why:"Vague entries have limited impact. Specificity ('I felt anxious before the meeting because I wasn't prepared') builds self-awareness faster."},{icon:'🚫',title:"Don't edit yourself",why:'Journaling is a thinking tool, not a writing performance. Write as if no one will ever read it.'},{icon:'🌀',title:'Name emotions precisely',why:"Affect labelling (Lieberman, UCLA 2007): naming a feeling ('frustrated' not 'bad') reduces amygdala activation — literally calms you."},{icon:'🌅',title:'Pick morning or evening and stick to it',why:'Morning primes your brain for the day. Evening consolidates memory and improves sleep. Inconsistency loses the benefits.'},{icon:'🔄',title:'Review past entries monthly',why:'Growth invisible day-to-day becomes obvious at distance. Monthly reviews build metacognition.'}].map(({icon,title,why})=>(
            <div key={title} style={{ display:'flex', gap:'12px', marginBottom:'14px' }}>
              <span style={{ fontSize:'18px', flexShrink:0, marginTop:'2px' }}>{icon}</span>
              <div><p style={{ fontSize:'13px', fontWeight:700, color:C.purple, marginBottom:'4px' }}>{title}</p><p style={{ fontSize:'12px', color:C.textMd, lineHeight:1.6 }}>{why}</p></div>
            </div>
          ))}
        </div>
      )}
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'14px', overflow:'hidden' }}>
        <div style={{ padding:'16px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><p style={{ fontFamily:"'Lora',serif", fontSize:'15px', fontWeight:700, color:C.textHi }}>Today</p><p style={{ fontSize:'11px', color:C.textLo, marginTop:'2px' }}>{fmtDate(today)}</p></div>
          {journals[today]&&<span style={{ fontSize:'11px', fontWeight:700, color:C.green, background:C.greenLt, padding:'3px 10px', borderRadius:'99px' }}>Saved ✓</span>}
        </div>
        <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:'16px' }}>
          <div>
            <Label>How are you feeling?</Label>
            <div style={{ display:'flex', gap:'8px' }}>
              {MOOD_OPTIONS.map(m=>(
                <button key={m.label} onClick={() => updateEntry({ mood:entry.mood===m.label?'':m.label })}
                  style={{ flex:1, padding:'10px 4px', border:`1.5px solid ${entry.mood===m.label?m.color:C.border}`, borderRadius:'10px', background:entry.mood===m.label?m.color+'18':'transparent', cursor:'pointer', transition:'all 0.15s', display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
                  <span style={{ fontSize:'20px' }}>{m.emoji}</span>
                  <span style={{ fontSize:'9px', fontWeight:700, color:entry.mood===m.label?m.color:C.textLo }}>{m.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Journal type</Label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
              {[{id:'free',label:'Free writing',icon:'🌊',desc:'Unstructured, unfiltered'},...Object.entries(PROMPT_SETS).map(([id,ps])=>({id,label:ps.label,icon:'✦',desc:'Guided prompts'}))].map(opt=>(
                <button key={opt.id} onClick={() => updateEntry({ type:opt.id })}
                  style={{ padding:'10px 12px', border:`1.5px solid ${entry.type===opt.id?C.accent:C.border}`, borderRadius:'10px', background:entry.type===opt.id?C.accentLt:'transparent', cursor:'pointer', textAlign:'left', transition:'all 0.15s' }}>
                  <p style={{ fontSize:'13px', fontWeight:700, color:entry.type===opt.id?C.accent:C.textHi }}>{opt.icon} {opt.label}</p>
                  <p style={{ fontSize:'10px', color:C.textLo, marginTop:'2px' }}>{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
          {entry.type!=='free'&&PROMPT_SETS[entry.type]&&(
            <div style={{ padding:'10px 12px', background:PROMPT_SETS[entry.type].bg, borderRadius:'10px', border:`1px solid ${PROMPT_SETS[entry.type].color}33` }}>
              <p style={{ fontSize:'11px', color:PROMPT_SETS[entry.type].color, lineHeight:1.6 }}>⚗ {PROMPT_SETS[entry.type].science}</p>
            </div>
          )}
          {entry.type==='free'?(
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' }}>
                <Label style={{ marginBottom:0 }}>Write freely — no rules</Label>
                <span style={{ fontSize:'11px', color:C.textLo }}>{wordCount(entry.freeText)} words</span>
              </div>
              <textarea rows={8} placeholder="What's on your mind? Don't filter it." value={entry.freeText||''} onChange={e => updateEntry({ freeText:e.target.value })} style={{ resize:'vertical', lineHeight:'1.8', fontFamily:"'Lora',serif", fontSize:'14px' }} />
            </div>
          ):(
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              {PROMPT_SETS[entry.type]?.prompts.map((prompt,i)=>(
                <div key={i}>
                  <p style={{ fontSize:'13px', fontWeight:600, color:C.textHi, marginBottom:'8px', lineHeight:1.4 }}>{prompt}</p>
                  <textarea rows={3} placeholder="Write your answer here…" value={(entry.prompts||{})[prompt]||''} onChange={e => updateEntry({ prompts:{...(entry.prompts||{}),[prompt]:e.target.value} })} style={{ resize:'vertical', lineHeight:'1.7', fontFamily:"'Lora',serif", fontSize:'13px' }} />
                </div>
              ))}
            </div>
          )}
          <button onClick={save} className="btn-primary" style={{ width:'100%', marginTop:'4px' }}>{saved?'Saved ✓':'Save entry'}</button>
        </div>
      </div>
      {allDates.length>0&&(
        <div>
          <Label style={{ marginTop:'4px' }}>Past entries</Label>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {allDates.map(ds => {
              const e=journals[ds]; const mood=MOOD_OPTIONS.find(m=>m.label===e.mood); const ps=PROMPT_SETS[e.type]
              const wc=wordCount(e.freeText)+Object.values(e.prompts||{}).reduce((s,v)=>s+wordCount(v),0)
              return (
                <button key={ds} onClick={() => setViewDate(ds)} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'14px 16px', background:C.surface, border:`1px solid ${C.border}`, borderRadius:'12px', cursor:'pointer', textAlign:'left', width:'100%', transition:'all 0.15s' }}>
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:'13px', fontWeight:700, color:C.textHi }}>{fmtDate(ds)}</p>
                    <div style={{ display:'flex', gap:'8px', alignItems:'center', marginTop:'4px' }}>
                      {mood&&<span style={{ fontSize:'14px' }}>{mood.emoji}</span>}
                      {ps&&<span style={{ fontSize:'10px', fontWeight:600, color:ps.color, background:ps.bg, padding:'2px 7px', borderRadius:'99px' }}>{ps.label}</span>}
                      <span style={{ fontSize:'11px', color:C.textLo }}>{wc} words</span>
                    </div>
                  </div>
                  <span style={{ color:C.textLo, fontSize:'16px' }}>›</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── BOOKS ─────────────────────────────────────────────────────
function Books({ books, saveBooks }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title:'', author:'', pages:'', currentPage:'0', status:'reading' })
  const [pageInputs, setPageInputs] = useState({})
  const addBook = async () => {
    if (!form.title.trim()) return
    await saveBooks([...books, { ...form, id:Date.now().toString(), pages:+form.pages||0, currentPage:+form.currentPage||0, startDate:todayStr() }])
    setForm({ title:'', author:'', pages:'', currentPage:'0', status:'reading' }); setShowForm(false)
  }
  const updatePage = async (id) => { const val=parseInt(pageInputs[id]); if(isNaN(val))return; await saveBooks(books.map(b=>b.id===id?{...b,currentPage:Math.min(val,b.pages||val)}:b)); setPageInputs(p=>({...p,[id]:''})) }
  const setStatus = async (id,status) => saveBooks(books.map(b=>b.id===id?{...b,status,...(status==='finished'?{currentPage:b.pages}:{})}:b))
  const remove = async (id) => saveBooks(books.filter(b=>b.id!==id))
  const sorted = [...books].sort((a,b)=>({reading:0,want:1,paused:2,finished:3}[a.status]||0)-({reading:0,want:1,paused:2,finished:3}[b.status]||0))
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <p style={{ fontFamily:"'Lora',serif", fontSize:'22px', fontWeight:700, color:C.textHi }}>Library</p>
        <button className="btn-primary" onClick={() => setShowForm(v=>!v)}>+ Add book</button>
      </div>
      {books.length>0&&<div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>{Object.entries(BOOK_COLORS).map(([s,fg])=>{ const n=books.filter(b=>b.status===s).length; return n>0?<Tag key={s} fg={fg} bg={fg+'22'}>{s} · {n}</Tag>:null })}</div>}
      {showForm&&(
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'14px', padding:'20px' }} className="fade-in">
          <Label>Add Book</Label>
          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
            <input placeholder="Title *" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} />
            <input placeholder="Author" value={form.author} onChange={e=>setForm({...form,author:e.target.value})} />
            <div style={{ display:'flex', gap:'10px' }}>
              <input type="number" placeholder="Total pages" value={form.pages} onChange={e=>setForm({...form,pages:e.target.value})} />
              <input type="number" placeholder="Current page" value={form.currentPage} onChange={e=>setForm({...form,currentPage:e.target.value})} />
            </div>
            <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
              <option value="reading">Currently Reading</option><option value="want">Want to Read</option><option value="paused">Paused</option><option value="finished">Finished</option>
            </select>
            <FormBtns onSave={addBook} onCancel={() => setShowForm(false)} label="Add Book" />
          </div>
        </div>
      )}
      {books.length===0&&!showForm&&<Empty icon="📖" l1="No books yet" l2="Track what you're reading." />}
      {sorted.map(book=>{ const fg=BOOK_COLORS[book.status]||C.textLo; const pct=book.pages>0?Math.round((book.currentPage/book.pages)*100):0; return (
        <div key={book.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'12px', padding:'16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ flex:1, marginRight:'10px' }}><p style={{ fontWeight:700, fontSize:'15px', color:C.textHi }}>{book.title}</p>{book.author&&<p style={{ fontSize:'12px', color:C.textLo, marginTop:'3px' }}>{book.author}</p>}</div>
            <div style={{ display:'flex', gap:'6px', alignItems:'center' }}><Tag fg={fg} bg={fg+'22'}>{book.status}</Tag><DeleteBtn onClick={() => remove(book.id)} /></div>
          </div>
          {book.pages>0&&<div style={{ marginTop:'12px' }}><div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}><p style={{ fontSize:'11px', color:C.textLo }}>p.{book.currentPage} of {book.pages}</p><p style={{ fontSize:'12px', fontWeight:700, color:fg }}>{pct}%</p></div><ProgressBar pct={pct} color={fg} /></div>}
          {book.status==='reading'&&<div style={{ display:'flex', gap:'8px', marginTop:'14px' }}><input type="number" placeholder="Update page…" value={pageInputs[book.id]||''} onChange={e=>setPageInputs(p=>({...p,[book.id]:e.target.value}))} onKeyDown={e=>e.key==='Enter'&&updatePage(book.id)} style={{ flex:1 }} /><button className="btn-ghost" onClick={() => updatePage(book.id)}>Update</button><button className="btn-green" onClick={() => setStatus(book.id,'finished')}>Done ✓</button></div>}
          {book.status==='want'&&<button className="btn-primary" style={{ marginTop:'12px', width:'100%' }} onClick={() => setStatus(book.id,'reading')}>Start reading →</button>}
        </div>
      )})}
    </div>
  )
}

// ── GOALS ─────────────────────────────────────────────────────
function Goals({ goals, saveGoals }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title:'', category:'Fitness', description:'', targetDate:'', progress:0 })
  const addGoal = async () => { if(!form.title.trim())return; await saveGoals([...goals,{ ...form,id:Date.now().toString(),progress:+form.progress||0,completed:false,createdDate:todayStr() }]); setForm({ title:'', category:'Fitness', description:'', targetDate:'', progress:0 }); setShowForm(false) }
  const updateProgress = async (id,val) => saveGoals(goals.map(g=>g.id===id?{...g,progress:Math.min(100,Math.max(0,+val||0))}:g))
  const toggle = async (id) => saveGoals(goals.map(g=>g.id===id?{...g,completed:!g.completed,progress:!g.completed?100:g.progress}:g))
  const remove = async (id) => saveGoals(goals.filter(g=>g.id!==id))
  const active=goals.filter(g=>!g.completed), done=goals.filter(g=>g.completed)
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <p style={{ fontFamily:"'Lora',serif", fontSize:'22px', fontWeight:700, color:C.textHi }}>Goals</p>
        <button className="btn-primary" onClick={() => setShowForm(v=>!v)}>+ Set goal</button>
      </div>
      {goals.length>0&&<div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'12px', padding:'16px', display:'flex', justifyContent:'space-around' }}>{[['Active',active.length,C.accent],['Done',done.length,C.green],['Total',goals.length,C.textHi]].map(([l,v,color])=><div key={l} style={{ textAlign:'center' }}><p style={{ fontFamily:"'Lora',serif", fontSize:'28px', fontWeight:700, color, lineHeight:1 }}>{v}</p><p style={{ fontSize:'11px', color:C.textLo, marginTop:'4px', fontWeight:600 }}>{l}</p></div>)}</div>}
      {showForm&&(
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'14px', padding:'20px' }} className="fade-in">
          <Label>New Goal</Label>
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            <input placeholder="What do you want to achieve? *" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} />
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>{GOAL_CATS.map(c=>{ const col=GOAL_COLORS[c]||C.accent; return <button key={c} onClick={() => setForm({...form,category:c})} style={{ padding:'6px 14px', border:`1.5px solid ${form.category===c?col:C.border}`, borderRadius:'99px', background:form.category===c?col+'22':'transparent', color:form.category===c?col:C.textMd, fontSize:'12px', fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>{c}</button> })}</div>
            <textarea rows={2} placeholder="Why does this matter to you?" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} />
            <input type="date" value={form.targetDate} onChange={e=>setForm({...form,targetDate:e.target.value})} />
            <FormBtns onSave={addGoal} onCancel={() => setShowForm(false)} label="Set Goal" />
          </div>
        </div>
      )}
      {goals.length===0&&!showForm&&<Empty icon="🎯" l1="No goals yet" l2="Set the target. Let the habits do the work." />}
      {active.map(g=>{ const color=GOAL_COLORS[g.category]||C.accent; const daysLeft=g.targetDate?Math.ceil((new Date(g.targetDate+'T12:00:00')-new Date())/86400000):null; return (
        <div key={g.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:'12px', padding:'16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div style={{ flex:1, marginRight:'10px' }}>
              <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'8px', flexWrap:'wrap' }}>
                <Tag fg={color} bg={color+'22'}>{g.category}</Tag>
                {daysLeft!==null&&<span style={{ fontSize:'11px', fontWeight:600, color:daysLeft<7?C.red:daysLeft<30?C.yellow:C.textLo }}>{daysLeft>0?`${daysLeft}d left`:daysLeft===0?'Due today':`${Math.abs(daysLeft)}d overdue`}</span>}
              </div>
              <p style={{ fontWeight:700, fontSize:'15px', color:C.textHi }}>{g.title}</p>
              {g.description&&<p style={{ fontSize:'12px', color:C.textMd, marginTop:'5px' }}>{g.description}</p>}
            </div>
            <DeleteBtn onClick={() => remove(g.id)} />
          </div>
          <div style={{ marginTop:'14px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}><p style={{ fontSize:'11px', fontWeight:600, color:C.textLo }}>Progress</p><p style={{ fontSize:'13px', fontWeight:700, color }}>{g.progress}%</p></div>
            <ProgressBar pct={g.progress} color={color} h={7} />
            <div style={{ display:'flex', gap:'10px', marginTop:'12px', alignItems:'center' }}>
              <input type="range" min="0" max="100" value={g.progress} onChange={e=>updateProgress(g.id,e.target.value)} style={{ flex:1, accentColor:color, background:'transparent', border:'none', padding:0, cursor:'pointer' }} />
              <button className="btn-green" onClick={() => toggle(g.id)}>Done ✓</button>
            </div>
          </div>
        </div>
      )})}
      {done.length>0&&<div><Label style={{ marginTop:'4px' }}>Completed</Label>{done.map(g=><div key={g.id} style={{ background:C.greenLt, border:`1px solid ${C.green}33`, borderRadius:'12px', padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px', opacity:0.75 }}><div><p style={{ fontSize:'14px', fontWeight:600, textDecoration:'line-through', color:C.green }}>{g.title}</p><div style={{ marginTop:'5px' }}><Tag fg={C.green} bg={C.greenLt}>{g.category}</Tag></div></div><div style={{ display:'flex', gap:'8px', alignItems:'center' }}><button onClick={() => toggle(g.id)} style={{ background:'none', border:`1px solid ${C.border}`, color:C.textMd, padding:'6px 12px', borderRadius:'8px', fontSize:'12px', cursor:'pointer' }}>Undo</button><DeleteBtn onClick={() => remove(g.id)} /></div></div>)}</div>}
    </div>
  )
}

// ── ROOT APP ──────────────────────────────────────────────────
export default function App({ session }) {
  const [tab, setTab] = useState('today')
  const [habits, setHabits] = useState([])
  const [completions, setCompletions] = useState({})
  const [books, setBooks] = useState([])
  const [goals, setGoals] = useState([])
  const [journals, setJournals] = useState({})
  const [identity, setIdentity] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    (async () => {
      const [h,c,b,g,id,jIdx] = await Promise.all([
        sGet(K.habits), sGet(K.completions), sGet(K.books), sGet(K.goals), sGet(K.identity), sGet(JOURNAL_IDX)
      ])
      if (h) setHabits(h); if (c) setCompletions(c); if (b) setBooks(b); if (g) setGoals(g); if (id) setIdentity(id)
      if (jIdx?.length) {
        const entries = await Promise.all(jIdx.map(d => sGet(JOURNAL_KEY(d))))
        const map = {}; jIdx.forEach((d,i) => { if(entries[i]) map[d]=entries[i] }); setJournals(map)
      }
      setReady(true)
    })()
  }, [])

  const saveHabits = async u => { setHabits(u); await sSet(K.habits,u) }
  const saveCompletions = async u => { setCompletions(u); await sSet(K.completions,u) }
  const saveBooks = async u => { setBooks(u); await sSet(K.books,u) }
  const saveGoals = async u => { setGoals(u); await sSet(K.goals,u) }
  const saveJournal = async (date, entry) => {
    const updated = { ...journals, [date]:entry }; setJournals(updated)
    await sSet(JOURNAL_KEY(date), entry)
    await sSet(JOURNAL_IDX, Object.keys(updated).sort((a,b)=>b.localeCompare(a)))
  }

  const todayHabits = habits.filter(h => isScheduledOn(h, new Date()))
  const doneToday = (completions[todayStr()]||[]).filter(id => todayHabits.find(h=>h.id===id)).length
  const allDoneToday = todayHabits.length>0&&doneToday>=todayHabits.length

  const TABS = [
    { id:'today',   label:'Today',   icon:'◑' },
    { id:'habits',  label:'Habits',  icon:'◉' },
    { id:'journal', label:'Journal', icon:'✦' },
    { id:'books',   label:'Books',   icon:'◧' },
    { id:'goals',   label:'Goals',   icon:'◎' },
  ]

  const dayName = new Date().toLocaleDateString('en-AU',{weekday:'long'})
  const ds = new Date().toLocaleDateString('en-AU',{day:'numeric',month:'long'})

  if (!ready) return <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center' }}><p style={{ color:C.accent, fontFamily:'Georgia,serif', fontSize:'14px', letterSpacing:'0.1em' }}>Loading…</p></div>

  return (
    <div style={{ background:C.bg, minHeight:'100vh', color:C.textHi, fontFamily:"'Inter',-apple-system,sans-serif", paddingBottom:'80px' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,600;0,700;1,400&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{-webkit-font-smoothing:antialiased}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.borderMd};border-radius:2px}
        input,textarea,select{background:${C.surface};color:${C.textHi};border:1.5px solid ${C.border};border-radius:10px;padding:11px 14px;font-family:inherit;font-size:13px;width:100%;outline:none;transition:border-color 0.15s;-webkit-appearance:none;appearance:none}
        input:focus,textarea:focus,select:focus{border-color:${C.accent};box-shadow:0 0 0 3px ${C.accent}18}
        input::placeholder,textarea::placeholder{color:${C.textLo}}
        select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='7'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%238C857D' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;padding-right:36px}
        button{cursor:pointer;font-family:inherit}
        .btn-primary{background:${C.accent};color:#fff;border:none;padding:11px 18px;border-radius:10px;font-weight:700;font-size:13px;transition:all 0.15s}
        .btn-primary:hover{background:#BF561F;transform:translateY(-1px);box-shadow:0 4px 12px ${C.accent}44}
        .btn-ghost{background:transparent;color:${C.textMd};border:1.5px solid ${C.border};padding:10px 16px;border-radius:10px;font-size:13px;font-weight:600;transition:all 0.15s}
        .btn-ghost:hover{border-color:${C.accent};color:${C.accent}}
        .btn-green{background:${C.greenLt};color:${C.green};border:1.5px solid ${C.green}44;padding:10px 14px;border-radius:10px;font-size:12px;font-weight:700;transition:all 0.15s;white-space:nowrap}
        .btn-green:hover{background:${C.green};color:#fff}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .fade-in{animation:fadeIn 0.25s ease forwards}
      `}</style>

      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:'18px 20px 14px', display:'flex', justifyContent:'space-between', alignItems:'flex-end', position:'sticky', top:0, zIndex:50 }}>
        <div>
          <p style={{ fontFamily:"'Lora',serif", fontSize:'22px', fontWeight:700, color:C.textHi, lineHeight:1 }}>Routine<span style={{ color:C.accent }}>.</span></p>
          <p style={{ fontSize:'12px', color:C.textLo, marginTop:'4px' }}>{dayName}, {ds}</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          {todayHabits.length>0&&<div style={{ textAlign:'right' }}><p style={{ fontSize:'11px', color:C.textLo, fontWeight:600 }}>Today</p><p style={{ fontSize:'16px', fontWeight:800, color:allDoneToday?C.green:C.accent, marginTop:'2px' }}>{doneToday}/{todayHabits.length}</p></div>}
          <button onClick={() => supabase.auth.signOut()} style={{ background:'none', border:`1px solid ${C.border}`, color:C.textLo, padding:'6px 10px', borderRadius:'8px', fontSize:'11px', cursor:'pointer', fontWeight:600 }}>Sign out</button>
        </div>
      </div>

      <div style={{ padding:'20px', maxWidth:'540px', margin:'0 auto' }} key={tab} className="fade-in">
        {tab==='today'   && <Today   habits={habits} completions={completions} saveCompletions={saveCompletions} identity={identity} setIdentityRaw={setIdentity} />}
        {tab==='habits'  && <Habits  habits={habits} completions={completions} saveHabits={saveHabits} />}
        {tab==='journal' && <Journal journals={journals} saveJournal={saveJournal} />}
        {tab==='books'   && <Books   books={books}   saveBooks={saveBooks} />}
        {tab==='goals'   && <Goals   goals={goals}   saveGoals={saveGoals} />}
      </div>

      <div style={{ position:'fixed', bottom:0, left:0, right:0, background:C.navBg, borderTop:`1px solid ${C.navBorder}`, display:'flex', padding:'0 4px', paddingBottom:'env(safe-area-inset-bottom)', boxShadow:'0 -4px 20px rgba(0,0,0,0.06)' }}>
        {TABS.map(t => { const active=tab===t.id; return (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex:1, padding:'11px 0 9px', background:'none', border:'none', display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', color:active?C.accent:C.textLo, transition:'color 0.2s', position:'relative' }}>
            {active&&<div style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:'20px', height:'3px', background:C.accent, borderRadius:'0 0 3px 3px' }} />}
            <span style={{ fontSize:'15px' }}>{t.icon}</span>
            <span style={{ fontSize:'9px', fontWeight:active?700:500, letterSpacing:'0.04em' }}>{t.label}</span>
          </button>
        )})}
      </div>
    </div>
  )
}

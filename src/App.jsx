import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

const EVENT_ROW_ID = 1
const STORAGE_KEY = 'football_my_name'

function emptyState(name, target) {
  return {
    name,
    target: target || null,
    isOpen: true,
    createdAt: Date.now(),
    going: {},
    notGoing: {},
    thinking: {}
  }
}

export default function App() {
  const [myName, setMyName] = useState(() => localStorage.getItem(STORAGE_KEY) || '')
  const [roster, setRoster] = useState([])
  const [newRosterName, setNewRosterName] = useState('')
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)

  // --- load roster ---
  const loadRoster = useCallback(async () => {
    const { data, error } = await supabase.from('roster').select('name').order('name')
    if (!error && data) setRoster(data.map(r => r.name))
  }, [])

  // --- load event state ---
  const loadEvent = useCallback(async () => {
    const { data, error } = await supabase
      .from('event_state')
      .select('data')
      .eq('id', EVENT_ROW_ID)
      .maybeSingle()
    if (!error) setState(data ? data.data : null)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadRoster()
    loadEvent()

    const channel = supabase
      .channel('event_state_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_state', filter: `id=eq.${EVENT_ROW_ID}` },
        payload => {
          if (payload.new && 'data' in payload.new) setState(payload.new.data)
          if (payload.eventType === 'DELETE') setState(null)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadRoster, loadEvent])

  const saveState = useCallback(async next => {
    setState(next) // optimistic
    await supabase.from('event_state').upsert({ id: EVENT_ROW_ID, data: next })
  }, [])

  const pickName = async name => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (!roster.includes(trimmed)) {
      await supabase.from('roster').insert({ name: trimmed })
      loadRoster()
    }
    localStorage.setItem(STORAGE_KEY, trimmed)
    setMyName(trimmed)
  }

  const switchUser = () => {
    localStorage.removeItem(STORAGE_KEY)
    setMyName('')
  }

  // --- event actions ---
  const createEvent = async (name, target) => {
    await saveState(emptyState(name, target))
  }

  const resetEvent = async () => {
    if (!window.confirm('Удалить текущий сбор и начать новый? Действие необратимо для всех.')) return
    setState(null)
    await supabase.from('event_state').delete().eq('id', EVENT_ROW_ID)
  }

  const vote = async kind => {
    if (!myName) return
    const next = structuredClone(state)
    delete next.notGoing[myName]
    delete next.thinking[myName]
    delete next.going[myName]
    if (kind === 'go') next.going[myName] = { plusOne: 0, selfPaid: false, guestsPaid: 0 }
    if (kind === 'notgo') next.notGoing[myName] = true
    if (kind === 'think') next.thinking[myName] = true
    await saveState(next)
  }

  const changeGuests = async delta => {
    if (!state.going[myName]) return
    const next = structuredClone(state)
    const p = next.going[myName]
    p.plusOne = Math.max(0, p.plusOne + delta)
    if (p.guestsPaid > p.plusOne) p.guestsPaid = p.plusOne
    await saveState(next)
  }

  const toggleSelfPaid = async name => {
    const next = structuredClone(state)
    if (!next.going[name]) return
    next.going[name].selfPaid = !next.going[name].selfPaid
    await saveState(next)
  }

  const payGuest = async (name, delta) => {
    const next = structuredClone(state)
    const p = next.going[name]
    if (!p) return
    p.guestsPaid = Math.max(0, Math.min((p.guestsPaid || 0) + delta, p.plusOne))
    await saveState(next)
  }

  const toggleOpen = async () => {
    const next = structuredClone(state)
    next.isOpen = !next.isOpen
    await saveState(next)
  }

  if (loading) return <div className="wrap"><p className="empty">Загрузка…</p></div>

  return (
    <div className="wrap">
      <h1>⚽ Сбор на футбол</h1>
      <div className="sub">Общая ссылка для всей компании — не зависит от мессенджера</div>

      {!myName ? (
        <NameGate
          roster={roster}
          newRosterName={newRosterName}
          setNewRosterName={setNewRosterName}
          onPick={pickName}
        />
      ) : !state ? (
        <>
          <Whoami name={myName} onSwitch={switchUser} />
          <Setup onCreate={createEvent} />
        </>
      ) : (
        <>
          <Whoami name={myName} onSwitch={switchUser} />
          <Board
            state={state}
            myName={myName}
            vote={vote}
            changeGuests={changeGuests}
            toggleSelfPaid={toggleSelfPaid}
            payGuest={payGuest}
            toggleOpen={toggleOpen}
            resetEvent={resetEvent}
          />
        </>
      )}
    </div>
  )
}

function NameGate({ roster, newRosterName, setNewRosterName, onPick }) {
  return (
    <div className="card">
      <label>Вы кто из списка?</label>
      {roster.length > 0 && (
        <div className="rosterList">
          {roster.map(n => (
            <button key={n} className="btn-ghost rosterBtn" onClick={() => onPick(n)}>
              {n}
            </button>
          ))}
        </div>
      )}
      <label style={{ marginTop: 16 }}>Не нашли себя? Добавьтесь в список</label>
      <div className="row">
        <input
          type="text"
          placeholder="Ваше имя"
          value={newRosterName}
          onChange={e => setNewRosterName(e.target.value)}
        />
        <button className="btn-primary" onClick={() => onPick(newRosterName)}>
          Это я
        </button>
      </div>
      <div className="empty" style={{ marginTop: 10 }}>
        Это устройство запомнит ваш выбор — при следующем заходе по этой же ссылке вводить имя не придётся.
      </div>
    </div>
  )
}

function Whoami({ name, onSwitch }) {
  return (
    <div className="whoami">
      Вы: <b>{name}</b> &nbsp;<button className="link" onClick={onSwitch}>не я / сменить</button>
    </div>
  )
}

function Setup({ onCreate }) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  return (
    <div className="card">
      <label>Название сбора</label>
      <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Футзал в субботу, 20:00" />
      <label>Нужно человек (необязательно)</label>
      <input type="text" value={target} onChange={e => setTarget(e.target.value)} placeholder="10 или 15" />
      <button
        className="btn-primary"
        style={{ width: '100%' }}
        onClick={() => {
          if (!name.trim()) return alert('Введите название')
          onCreate(name.trim(), target.trim())
        }}
      >
        Создать сбор
      </button>
    </div>
  )
}

function Board({ state, myName, vote, changeGuests, toggleSelfPaid, payGuest, toggleOpen, resetEvent }) {
  const goingEntries = Object.entries(state.going || {})
  const plusCount = goingEntries.reduce((s, [, v]) => s + (v.plusOne || 0), 0)
  const totalGoing = goingEntries.length + plusCount
  const notEntries = Object.keys(state.notGoing || {})
  const thinkEntries = Object.keys(state.thinking || {})

  let totalPaid = 0
  if (!state.isOpen) {
    goingEntries.forEach(([, v]) => {
      if (v.selfPaid) totalPaid += 1
      totalPaid += v.guestsPaid || 0
    })
  }

  const myEntry = state.going?.[myName]

  return (
    <div className="card">
      <div className="event-name">{state.name}</div>
      <span className={`status ${state.isOpen ? 'open' : 'closed'}`}>
        {state.isOpen ? 'сбор открыт' : 'сбор закрыт'}
      </span>
      {state.target && <div className="empty" style={{ margin: '-4px 0 10px' }}>Нужно: {state.target} человек</div>}

      {state.isOpen ? (
        <>
          <div className="row" style={{ marginBottom: 8 }}>
            <button className="btn-primary" onClick={() => vote('go')}>✅ Иду</button>
            <button className="btn-ghost" onClick={() => vote('notgo')}>❌ Не иду</button>
            <button className="btn-ghost" onClick={() => vote('think')}>🤔 Думаю</button>
          </div>
          {myEntry && (
            <div className="row">
              <button className="btn-ghost" onClick={() => changeGuests(-1)}>− гостя</button>
              <button className="btn-ghost" onClick={() => changeGuests(1)}>+ гостя</button>
            </div>
          )}
        </>
      ) : (
        <div className="empty">Сбор закрыт — можно только отмечать оплаты</div>
      )}

      <div className="section-title">Идут ({goingEntries.length}{plusCount ? ` +${plusCount}` : ''})</div>
      {goingEntries.length ? (
        goingEntries.map(([name, v]) => (
          <div key={name}>
            <div className="person">
              <span>
                ✅ {name} {!state.isOpen && v.selfPaid && <span className="paid-tag">💰 оплатил</span>}
              </span>
              {!state.isOpen && (
                <button className="link" onClick={() => toggleSelfPaid(name)}>
                  {v.selfPaid ? 'Снять оплату' : 'Отметить оплату'}
                </button>
              )}
            </div>
            {v.plusOne > 0 && (
              <div className="person guest-tag">
                <span>
                  +{v.plusOne} гостей {!state.isOpen && v.guestsPaid > 0 && `(оплачено ${v.guestsPaid}/${v.plusOne})`}
                </span>
                {!state.isOpen && (
                  <span className="pm-row">
                    <button className="btn-ghost" onClick={() => payGuest(name, -1)}>−</button>
                    <button className="btn-ghost" onClick={() => payGuest(name, 1)}>+</button>
                  </span>
                )}
              </div>
            )}
          </div>
        ))
      ) : (
        <div className="empty">Пока никто не отметился</div>
      )}

      <div className="section-title">Не идут ({notEntries.length})</div>
      {notEntries.length ? notEntries.map(n => <div className="person" key={n}>❌ {n}</div>) : <div className="empty">—</div>}

      <div className="section-title">Думают ({thinkEntries.length})</div>
      {thinkEntries.length ? thinkEntries.map(n => <div className="person" key={n}>🤔 {n}</div>) : <div className="empty">—</div>}

      <div className="stats">
        <div className="stat"><b>{totalGoing}</b>всего идут</div>
        {!state.isOpen && <div className="stat"><b>{totalPaid}</b>оплатили</div>}
      </div>

      <div className="footer-actions">
        <button className="btn-ghost" onClick={toggleOpen}>
          {state.isOpen ? '🔒 Закрыть сбор' : '🔓 Открыть сбор'}
        </button>
        <button className="link" onClick={resetEvent}>Начать новый сбор</button>
      </div>
    </div>
  )
}

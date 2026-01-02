import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
} from 'firebase/firestore';
import { 
  BookOpen, 
  ChevronRight, 
  Plus, 
  LayoutDashboard, 
  Book, 
  Settings, 
  ChevronLeft,
  Zap,
  Trash2,
  CheckSquare,
  Square,
  LogIn,
  AlertTriangle
} from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'execution-tracker-v2';

// --- Helper Functions ---
const calculateProgress = (chapter) => {
  if (!chapter || !chapter.sections) return 0;
  const sections = Object.values(chapter.sections);
  if (sections.length === 0) return 0;

  let totalQs = 0;
  let completedQs = 0;

  sections.forEach(section => {
    if (section.type === 'exercise' && section.subExercises) {
      Object.values(section.subExercises).forEach(ex => {
        totalQs += ex.questions?.length || 0;
        completedQs += ex.questions?.filter(q => q.completed).length || 0;
      });
    } else {
      totalQs += section.questions?.length || 0;
      completedQs += section.questions?.filter(q => q.completed).length || 0;
    }
  });

  return totalQs === 0 ? 0 : Math.round((completedQs / totalQs) * 100);
};

const ProgressBar = ({ progress, height = "h-1.5", color = "bg-indigo-600" }) => (
  <div className={`w-full bg-gray-100 rounded-full ${height} overflow-hidden`}>
    <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
  </div>
);

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupStep, setSetupStep] = useState(false);
  const [tempName, setTempName] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [view, setView] = useState({ type: 'main' });
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Auth Initialization and Listener (Rule 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        // First try Custom Token if available
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          // Automatic Anonymous login to prevent domain errors blocking app usage
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Initial Auth fallback failed:", e);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        const profileRef = doc(db, 'artifacts', appId, 'users', u.uid, 'settings', 'profile');
        try {
          const userDoc = await getDoc(profileRef);
          if (userDoc.exists() && userDoc.data().onboarded) {
            setUser({ ...u, displayName: userDoc.data().name || u.displayName || "User" });
            setSetupStep(false);
          } else {
            const nameToUse = u.displayName || "";
            if (nameToUse) {
              await setDoc(profileRef, { onboarded: true, name: nameToUse, setupAt: Date.now() }, { merge: true });
              setUser({ ...u, displayName: nameToUse });
              setSetupStep(false);
            } else {
              setSetupStep(true);
            }
          }
        } catch (err) {
          setUser(u); // Proceed even if profile fetch fails
        }
      } else {
        setUser(null);
        setSetupStep(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Sync (Rule 1 & 2)
  useEffect(() => {
    if (!user) {
      setSubjects([]);
      return;
    }
    const dataDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'data', 'subjects');
    const unsubscribe = onSnapshot(dataDocRef, (snap) => {
      if (snap.exists()) {
        setSubjects(snap.data().list || []);
      }
    }, (err) => console.error("Firestore sync error:", err));
    return () => unsubscribe();
  }, [user]);

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google Sign-in failed", error);
      if (error.code === 'auth/unauthorized-domain') {
        setAuthError({
          title: "Domain Not Authorized",
          message: "Google sign-in is blocked because this environment's domain isn't in your Firebase allowlist.",
          domain: window.location.hostname
        });
        // Stay logged in as anonymous so app doesn't break
      } else {
        setAuthError({ title: "Sign-in Failed", message: error.message });
      }
      setLoading(false);
    }
  };

  const saveData = async (newSubjs) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'data', 'subjects'), { list: newSubjs });
    } catch (e) {
      console.error("Save failed", e);
    }
  };

  const completeSetup = async () => {
    if (!auth.currentUser || !tempName.trim()) return;
    const profileRef = doc(db, 'artifacts', appId, 'users', auth.currentUser.uid, 'settings', 'profile');
    await setDoc(profileRef, { onboarded: true, name: tempName, setupAt: Date.now() }, { merge: true });
    setUser({ ...auth.currentUser, displayName: tempName });
    setSetupStep(false);
  };

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-white space-y-4 p-10 text-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-indigo-600"></div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Initializing Environment</p>
    </div>
  );

  if (setupStep) return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-sm bg-white p-10 rounded-[2.5rem] shadow-xl text-center border border-gray-100">
        <h2 className="text-xl font-black mb-6 uppercase tracking-tight">Identity</h2>
        <p className="text-gray-400 text-xs font-bold mb-6 uppercase tracking-widest">How should we address you?</p>
        <input 
          value={tempName} 
          onChange={(e) => setTempName(e.target.value)} 
          onKeyDown={(e) => e.key === 'Enter' && completeSetup()}
          className="w-full bg-gray-50 p-4 rounded-xl font-bold mb-6 text-center outline-none border-2 border-transparent focus:border-indigo-100" 
          placeholder="Enter Name" 
          autoFocus
        />
        <button onClick={completeSetup} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold active:scale-95 transition-transform">Initialize Dashboard</button>
      </div>
    </div>
  );

  // If we have an auth error but a user (anonymous), we show a notice but let them use the app
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-xl mx-auto border-x border-gray-100 font-sans pb-32 shadow-2xl relative">
      <header className="px-6 py-6 flex justify-between items-center bg-white/80 backdrop-blur sticky top-0 z-20 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center text-white"><BookOpen size={16} /></div>
          <span className="font-black text-sm tracking-tight uppercase">Tracker</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-black text-[10px] text-gray-900 uppercase leading-none">{user?.displayName || "Guest"}</p>
            <p className="font-bold text-[8px] text-gray-400 uppercase tracking-widest">{user?.isAnonymous ? "Local Persistence" : "Synced Profile"}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 font-black text-xs overflow-hidden">
            {user?.photoURL ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" /> : user?.displayName?.[0] || "?"}
          </div>
        </div>
      </header>

      {authError && (
        <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 mt-1 shrink-0" />
          <div className="space-y-1">
            <p className="font-black text-[10px] text-amber-800 uppercase tracking-widest">Sign-In Warning</p>
            <p className="text-[10px] text-amber-700 font-bold leading-tight">{authError.message}</p>
            <p className="text-[9px] text-amber-500 font-bold">You can still track your progress locally.</p>
            <button onClick={() => setAuthError(null)} className="text-[10px] font-black text-amber-900 uppercase pt-1">Dismiss</button>
          </div>
        </div>
      )}

      <main className="px-6 pt-6 flex-1">
        {activeTab === 'dashboard' && <Dashboard subjects={subjects} setView={setView} setActiveTab={setActiveTab} />}
        {activeTab === 'subjects' && (
          <SubjectManager 
            view={view} 
            setView={setView} 
            subjects={subjects} 
            addSubject={(name) => {
              if (!name.trim()) return;
              saveData([...subjects, { id: crypto.randomUUID(), name, chapters: [] }]);
              setIsAddingSubject(false);
            }} 
            addChapter={(sId, name, selectedSections) => {
              const sections = {};
              selectedSections.forEach(type => {
                const id = crypto.randomUUID();
                sections[id] = { id, label: type, type: type.toLowerCase(), questions: [], ...(type === 'EXERCISE' ? { subExercises: {} } : {}) };
              });
              saveData(subjects.map(s => s.id === sId ? { ...s, chapters: [...s.chapters, { id: crypto.randomUUID(), name, progress: 0, sections }] } : s));
            }} 
            toggleQuestion={(sId, cId, secId, qId, subExId) => {
              const newSubjs = subjects.map(s => {
                if (s.id !== sId) return s;
                return { ...s, chapters: s.chapters.map(c => {
                  if (c.id !== cId) return c;
                  const sec = c.sections[secId];
                  let newSecs;
                  if (subExId) {
                    const sub = sec.subExercises[subExId];
                    const upd = sub.questions.map(q => q.id === qId ? { ...q, completed: !q.completed } : q);
                    newSecs = { ...c.sections, [secId]: { ...sec, subExercises: { ...sec.subExercises, [subExId]: { ...sub, questions: upd } } } };
                  } else {
                    const upd = sec.questions.map(q => q.id === qId ? { ...q, completed: !q.completed } : q);
                    newSecs = { ...c.sections, [secId]: { ...sec, questions: upd } };
                  }
                  return { ...c, sections: newSecs, progress: calculateProgress({ ...c, sections: newSecs }) };
                })};
              });
              saveData(newSubjs);
            }} 
            genQuestions={(sId, cId, secId, count) => {
              const newSubjs = subjects.map(s => {
                if (s.id !== sId) return s;
                return { ...s, chapters: s.chapters.map(c => {
                  if (c.id !== cId) return c;
                  const updQs = Array.from({ length: count }, (_, i) => ({ id: `q-${i+1}`, completed: false }));
                  const newSecs = { ...c.sections, [secId]: { ...c.sections[secId], questions: updQs } };
                  return { ...c, sections: newSecs, progress: calculateProgress({ ...c, sections: newSecs }) };
                })};
              });
              saveData(newSubjs);
            }} 
            deleteChapter={(sId, cId) => {
              saveData(subjects.map(s => s.id === sId ? { ...s, chapters: s.chapters.filter(c => c.id !== cId) } : s));
              setView({ type: 'subject', id: sId });
            }}
            isAddingSubject={isAddingSubject}
            setIsAddingSubject={setIsAddingSubject}
            addGenericSection={(sId, cId, label) => {
              saveData(subjects.map(s => {
                if (s.id !== sId) return s;
                return { ...s, chapters: s.chapters.map(c => {
                  if (c.id !== cId) return c;
                  const secId = crypto.randomUUID();
                  const newSecs = { ...c.sections, [secId]: { id: secId, label, type: 'custom', questions: [] } };
                  return { ...c, sections: newSecs, progress: calculateProgress({ ...c, sections: newSecs }) };
                })};
              }));
            }}
            addSubExercise={(sId, cId, secId, name, count) => {
              const qCount = parseInt(count);
              saveData(subjects.map(s => {
                if (s.id !== sId) return s;
                return { ...s, chapters: s.chapters.map(c => {
                  if (c.id !== cId) return c;
                  const subId = crypto.randomUUID();
                  const newSub = { id: subId, name, questions: Array.from({ length: qCount }, (_, i) => ({ id: `q-${i+1}`, completed: false })) };
                  const newSecs = { ...c.sections, [secId]: { ...c.sections[secId], subExercises: { ...(c.sections[secId].subExercises || {}), [subId]: newSub } } };
                  return { ...c, sections: newSecs, progress: calculateProgress({ ...c, sections: newSecs }) };
                })};
              }));
            }}
          />
        )}
        {activeTab === 'settings' && <SettingsView user={user} handleGoogleSignIn={handleGoogleSignIn} />}
      </main>

      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-gray-900 rounded-[2rem] shadow-2xl px-4 py-3 z-50 flex justify-around">
        <NavBtn act={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={22} />} />
        <NavBtn act={activeTab === 'subjects'} onClick={() => { setActiveTab('subjects'); setView({ type: 'main' }); }} icon={<Book size={22} />} />
        <NavBtn act={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={22} />} />
      </nav>
    </div>
  );
};

// --- View Sub-Components ---

const Dashboard = ({ subjects, setView, setActiveTab }) => {
  const allChapters = subjects.flatMap(s => s.chapters.map(c => ({ ...c, sName: s.name, sId: s.id })));
  const globalProgress = allChapters.length > 0 ? Math.round(allChapters.reduce((a, b) => a + b.progress, 0) / allChapters.length) : 0;
  const recent = allChapters.filter(c => c.progress < 100).sort((a, b) => b.progress - a.progress).slice(0, 3);

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-50 rounded-full blur-2xl opacity-50" />
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Total Completion</h3>
        <p className="text-5xl font-black text-gray-900 tracking-tighter mb-4">{globalProgress}%</p>
        <ProgressBar progress={globalProgress} height="h-2" />
      </div>
      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 flex items-center gap-2"><Zap size={14} className="text-amber-500" /> Active Focus</h3>
      <div className="grid gap-3">
        {recent.map(c => (
          <div key={c.id} onClick={() => { setView({ type: 'chapter', id: c.id, sId: c.sId }); setActiveTab('subjects'); }} className="bg-white p-5 rounded-2xl border border-gray-100 flex items-center justify-between cursor-pointer shadow-sm group">
            <div><p className="text-[10px] font-black text-indigo-500 uppercase mb-1">{c.sName}</p><p className="font-bold text-gray-900">{c.name}</p></div>
            <div className="text-right flex items-center gap-4"><span className="font-black text-gray-900 text-sm">{c.progress}%</span><div className="w-10"><ProgressBar progress={c.progress} /></div></div>
          </div>
        ))}
        {recent.length === 0 && <div className="text-center py-10 text-[10px] font-bold text-gray-300 uppercase tracking-widest">No units in progress</div>}
      </div>
    </div>
  );
};

const SubjectManager = ({ view, setView, subjects, addSubject, addChapter, toggleQuestion, genQuestions, deleteChapter, isAddingSubject, setIsAddingSubject, addGenericSection, addSubExercise }) => {
  if (view.type === 'questions') {
    const s = subjects.find(s => s.id === view.sId);
    const c = s?.chapters.find(ch => ch.id === view.cId);
    const section = c?.sections?.[view.secId];
    if (!section) return null;

    let items = section.questions || [];
    let title = section.label;
    if (view.subExId) {
      const sub = section.subExercises[view.subExId];
      items = sub.questions || [];
      title = `${section.label} - ${sub.name}`;
    }
    
    const prog = items.length > 0 ? Math.round((items.filter(q => q.completed).length / items.length) * 100) : 0;

    return (
      <div className="animate-in slide-in-from-right duration-300">
        <button onClick={() => setView({ type: 'chapter', id: view.cId, sId: view.sId })} className="flex items-center gap-1 text-gray-400 mb-6 font-bold text-sm hover:text-indigo-600"><ChevronLeft size={18} /> Back</button>
        <div className="bg-white rounded-[2rem] p-8 border border-gray-100 space-y-8 shadow-sm">
          <div className="flex justify-between items-end"><h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">{title}</h2><span className="text-xl font-black text-indigo-600">{prog}%</span></div>
          <ProgressBar progress={prog} height="h-2" />

          {items.length === 0 ? (
            <div className="space-y-6 pt-4 text-center">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Question Count</p>
              <input id="q-gen-val" type="number" autoFocus className="w-full bg-gray-50 p-5 rounded-2xl font-black text-xl border-2 border-transparent focus:border-indigo-100 outline-none text-center" placeholder="0" onKeyDown={(e) => e.key === 'Enter' && genQuestions(view.sId, view.cId, section.id, parseInt(e.target.value))} />
              <button onClick={() => genQuestions(view.sId, view.cId, section.id, parseInt(document.getElementById('q-gen-val').value))} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg">Generate</button>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-3">
              {items.map((q, idx) => (
                <button key={q.id} onClick={() => toggleQuestion(view.sId, view.cId, section.id, q.id, view.subExId)} className={`aspect-square rounded-xl flex items-center justify-center font-black transition-all border-2 ${q.completed ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-gray-100 text-gray-400 hover:border-indigo-100'}`}>{idx + 1}</button>
              ))}
              <button onClick={() => confirm("Reset section?") && genQuestions(view.sId, view.cId, section.id, 0)} className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-300 hover:text-rose-500"><Trash2 size={20} /></button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view.type === 'chapter') {
    const s = subjects.find(s => s.id === view.sId);
    const c = s?.chapters.find(ch => ch.id === view.id);
    if (!c) return null;

    return (
      <div className="animate-in slide-in-from-right duration-300 space-y-8 pb-10">
        <div className="flex justify-between items-center">
          <button onClick={() => setView({ type: 'subject', id: view.sId })} className="flex items-center gap-1 text-gray-400 font-bold text-sm hover:text-indigo-600"><ChevronLeft size={18} /> {s.name}</button>
          <button onClick={() => confirm("Delete unit?") && deleteChapter(view.sId, c.id)} className="text-rose-400 hover:text-rose-600 p-2"><Trash2 size={18} /></button>
        </div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase mb-4">{c.name}</h1>
          <div className="bg-white p-5 rounded-[1.5rem] border border-gray-100 flex items-center gap-4 shadow-sm"><ProgressBar progress={c.progress} height="h-2" /><span className="font-black text-indigo-600">{c.progress}%</span></div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sections</h3>
            <AddSectionModal onAdd={(label) => addGenericSection(view.sId, c.id, label)} />
          </div>
          
          <div className="grid gap-3">
            {Object.values(c.sections || {}).map(sec => {
              if (sec.type === 'exercise') {
                return (
                  <div key={sec.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                      <p className="font-black text-gray-900 text-[10px] uppercase tracking-widest">{sec.label}</p>
                      <AddSubExModal onAdd={(name, count) => addSubExercise(view.sId, c.id, sec.id, name, count)} />
                    </div>
                    <div className="p-2 grid gap-1">
                      {Object.values(sec.subExercises || {}).map(sub => {
                        const prog = sub.questions?.length > 0 ? Math.round((sub.questions.filter(q => q.completed).length / sub.questions.length) * 100) : 0;
                        return (
                          <div key={sub.id} onClick={() => setView({ type: 'questions', sId: view.sId, cId: c.id, secId: sec.id, subExId: sub.id })} className="p-4 rounded-xl hover:bg-gray-50 transition-all cursor-pointer flex justify-between items-center group">
                            <div className="flex-1 mr-4">
                              <p className="font-bold text-gray-700 text-xs mb-1 group-hover:text-indigo-600 transition-colors">{sub.name}</p>
                              <ProgressBar progress={prog} height="h-1" />
                            </div>
                            <span className="text-[10px] font-black text-indigo-400">{prog}%</span>
                          </div>
                        );
                      })}
                      {Object.keys(sec.subExercises || {}).length === 0 && <p className="text-[8px] text-center py-4 text-gray-300 font-bold uppercase tracking-widest">No subsets defined</p>}
                    </div>
                  </div>
                );
              }

              const prog = sec.questions?.length > 0 ? Math.round((sec.questions.filter(q => q.completed).length / sec.questions.length) * 100) : 0;
              return (
                <div key={sec.id} onClick={() => setView({ type: 'questions', sId: view.sId, cId: c.id, secId: sec.id })} className="bg-white p-5 rounded-2xl border border-gray-100 cursor-pointer shadow-sm hover:border-indigo-100 transition-all flex items-center justify-between group">
                  <div className="flex-1 mr-4">
                    <p className="font-bold text-gray-900 text-sm mb-2 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">{sec.label}</p>
                    <ProgressBar progress={prog} />
                  </div>
                  <span className="font-black text-indigo-400 text-xs">{prog}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (view.type === 'subject') {
    const s = subjects.find(s => s.id === view.id);
    if (!s) return null;
    return (
      <div className="animate-in slide-in-from-right duration-300">
        <button onClick={() => setView({ type: 'main' })} className="flex items-center gap-1 text-gray-400 mb-6 font-bold text-sm hover:text-indigo-600"><ChevronLeft size={18} /> Library</button>
        <div className="flex justify-between items-center mb-8"><h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">{s.name}</h1><AddChapterModal sId={s.id} onAdd={addChapter} /></div>
        <div className="space-y-3">
          {s.chapters.map(ch => (
            <div key={ch.id} onClick={() => setView({ type: 'chapter', id: ch.id, sId: s.id })} className="bg-white p-6 rounded-2xl border border-gray-100 flex items-center justify-between cursor-pointer group shadow-sm transition-all hover:border-indigo-100">
              <div className="flex-1 mr-6"><h3 className="font-bold text-gray-900 mb-2">{ch.name}</h3><ProgressBar progress={ch.progress} height="h-1.5" /></div>
              <div className="flex items-center gap-4"><span className="font-black text-gray-900 text-sm">{ch.progress}%</span><ChevronRight size={18} className="text-gray-300 group-hover:text-indigo-600" /></div>
            </div>
          ))}
          {s.chapters.length === 0 && <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-gray-100 text-[10px] font-black text-gray-300 uppercase tracking-widest">No chapters added</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex items-center justify-between"><h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Library</h1><button onClick={() => setIsAddingSubject(true)} className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg"><Plus size={24} /></button></div>
      {isAddingSubject && (
        <div className="bg-white p-6 rounded-3xl border-2 border-indigo-600 shadow-xl animate-in zoom-in-95">
          <input id="s-input" autoFocus onKeyDown={(e) => e.key === 'Enter' && addSubject(e.target.value)} className="w-full bg-gray-50 p-4 rounded-xl font-bold mb-4 outline-none border-2 border-transparent focus:border-indigo-100" placeholder="e.g. Mathematics" />
          <div className="flex gap-4">
            <button onClick={() => setIsAddingSubject(false)} className="flex-1 font-black text-[10px] text-gray-400 uppercase tracking-widest">Cancel</button>
            <button onClick={() => addSubject(document.getElementById('s-input').value)} className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-bold">Create</button>
          </div>
        </div>
      )}
      <div className="grid gap-3">
        {subjects.map(s => (
          <div key={s.id} onClick={() => setView({ type: 'subject', id: s.id })} className="bg-white p-6 rounded-3xl border border-gray-100 flex items-center justify-between cursor-pointer shadow-sm hover:border-indigo-100 transition-all group">
            <div><h3 className="text-xl font-black text-gray-900 uppercase tracking-tight leading-none mb-1 group-hover:text-indigo-600">{s.name}</h3><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{s.chapters.length} Units</p></div>
            <ChevronRight className="text-gray-200 group-hover:text-indigo-600" />
          </div>
        ))}
      </div>
    </div>
  );
};

const AddChapterModal = ({ sId, onAdd }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(["EXAMPLES", "EXERCISE", "PYQS"]);
  if (!open) return <button onClick={() => setOpen(true)} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Plus size={20} /></button>;
  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 animate-in zoom-in-95">
        <h3 className="text-xl font-black mb-6 uppercase tracking-tight">New Unit</h3>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-50 p-4 rounded-xl font-bold mb-6 outline-none" placeholder="Unit Name..." />
        <div className="grid gap-2 mb-8">
          {["EXAMPLES", "EXERCISE", "PYQS"].map(type => (
            <button key={type} onClick={() => setSelected(p => p.includes(type) ? p.filter(x => x !== type) : [...p, type])} className={`flex items-center gap-3 p-4 rounded-xl font-bold text-xs transition-all ${selected.includes(type) ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-50 text-gray-400'}`}>
              {selected.includes(type) ? <CheckSquare size={16} /> : <Square size={16} />} {type}
            </button>
          ))}
        </div>
        <div className="flex gap-4">
          <button onClick={() => setOpen(false)} className="flex-1 font-black text-gray-400 text-[10px] uppercase">Cancel</button>
          <button onClick={() => { onAdd(sId, name, selected); setOpen(false); }} className="flex-[2] py-4 bg-indigo-600 text-white rounded-xl font-bold">Add</button>
        </div>
      </div>
    </div>
  );
};

const AddSectionModal = ({ onAdd }) => {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  if (!open) return <button onClick={() => setOpen(true)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-md flex items-center gap-1"><Plus size={12}/> Section</button>;
  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-xs z-[70] flex items-center justify-center p-6">
      <div className="bg-white w-full max-w-xs rounded-3xl p-6 shadow-2xl animate-in zoom-in-95">
        <input autoFocus value={val} onChange={e => setVal(e.target.value)} className="w-full bg-gray-50 p-4 rounded-xl font-black mb-6 outline-none text-center uppercase" placeholder="SECTION NAME" onKeyDown={e => e.key === 'Enter' && (onAdd(val.toUpperCase()), setOpen(false))} />
        <div className="flex gap-4">
          <button onClick={() => setOpen(false)} className="flex-1 text-[10px] font-black text-gray-400 uppercase">Cancel</button>
          <button onClick={() => { onAdd(val.toUpperCase()); setOpen(false); }} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs">Add</button>
        </div>
      </div>
    </div>
  );
};

const AddSubExModal = ({ onAdd }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [count, setCount] = useState("");
  if (!open) return <button onClick={() => setOpen(true)} className="px-3 py-1 bg-indigo-600 text-white rounded-full text-[8px] font-black uppercase tracking-widest"><Plus size={10} className="inline mr-1" /> Add Subset</button>;
  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[80] flex items-center justify-center p-6 text-left">
      <div className="bg-white w-full max-w-sm rounded-[2rem] p-8">
        <h3 className="font-black uppercase tracking-tight mb-6">Sub-Section</h3>
        <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-gray-50 p-4 rounded-xl font-bold mb-4 outline-none" placeholder="Label (e.g. Set A)" />
        <input type="number" value={count} onChange={e => setCount(e.target.value)} className="w-full bg-gray-50 p-4 rounded-xl font-bold mb-6 outline-none" placeholder="Question Count" />
        <div className="flex gap-4">
           <button onClick={() => setOpen(false)} className="flex-1 text-[10px] font-black text-gray-400 uppercase">Cancel</button>
           <button onClick={() => { onAdd(name, count); setOpen(false); }} className="flex-[2] py-4 bg-indigo-600 text-white rounded-xl font-black text-sm uppercase">Create</button>
        </div>
      </div>
    </div>
  );
};

const SettingsView = ({ user, handleGoogleSignIn }) => (
  <div className="space-y-6 animate-in fade-in">
    <h1 className="text-2xl font-black uppercase tracking-tight">System</h1>
    <div className="bg-white rounded-[2.5rem] p-10 border border-gray-100 shadow-sm text-center">
      <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center text-indigo-600 font-black text-4xl mx-auto mb-6 overflow-hidden">
        {user?.photoURL ? <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" /> : user?.displayName?.[0]}
      </div>
      <p className="text-2xl font-black text-gray-900 mb-1">{user?.displayName}</p>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-10">{user?.isAnonymous ? "Guest Mode (Local)" : user?.email}</p>
      
      {user?.isAnonymous && (
        <div className="mb-6 p-6 bg-indigo-50 rounded-2xl border border-indigo-100 text-left">
          <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest mb-2">Upgrade Persistence</p>
          <p className="text-xs text-indigo-600 font-medium mb-4">You are using local storage. Sign in with Google to sync across devices.</p>
          <button onClick={handleGoogleSignIn} className="w-full py-3 bg-white border border-indigo-100 rounded-xl flex items-center justify-center gap-2 font-black text-[10px] uppercase text-indigo-600 shadow-sm active:scale-95 transition-transform">
            <LogIn size={14} /> Connect Account
          </button>
        </div>
      )}

      <button onClick={() => signOut(auth)} className="w-full py-4 text-rose-500 font-black text-xs uppercase tracking-widest border-2 border-rose-50 rounded-2xl hover:bg-rose-50 transition-all flex items-center justify-center gap-2">
        Terminate Session
      </button>
    </div>
  </div>
);

const NavBtn = ({ act, onClick, icon }) => (
  <button onClick={onClick} className={`p-3.5 rounded-2xl transition-all active:scale-90 ${act ? 'bg-indigo-600 text-white shadow-xl scale-110' : 'text-gray-500 hover:text-gray-300'}`}>{icon}</button>
);

export default App;

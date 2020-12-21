import React from 'react';
import ReactDOM from 'react-dom';
import { Button, Checkbox, InputNumber } from 'antd';

declare const HTMLTIME: number;

interface SynthesizeFrom {
    itemName: string,
    count: number,
}

interface Item {
    name: string,
    icon?: readonly [number, number], // spirit offset x, y
    froms?: ReadonlyArray<Readonly<SynthesizeFrom>>,
}

interface LevelDrop {
    itemName: string,
    probilityLevel: string, // rare, fixed, etc
    probility: number, // 0 to 1
}

interface Level {
    name: string,
    drops: ReadonlyArray<Readonly<LevelDrop>>,
}
interface GameData {
    items: ReadonlyArray<Readonly<Item>>,
    levels: ReadonlyArray<Readonly<Level>>,
}

// mock
const gamedata: GameData = {
    items: [
        { name: '土块1' },
        { name: '刺1' },
        { name: '醇1' },
        { name: '土块2', froms: [{ itemName: '土块1', count: 4 }] },
        { name: '刺2', froms: [{ itemName: '刺1', count: 4 }] },
        { name: '醇2', froms: [{ itemName: '醇1', count: 4 }] },
    ],
    levels: [
        { name: '6-11', drops: [{ itemName: '醇1', probilityLevel: '1', probility: 0.5 }] },
        { name: '7-10', drops: [{ itemName: '刺1', probilityLevel: '1', probility: 0.4 }] },
    ],
}

interface ItemRequirement {
    itemName: string,
    have: number,
    expect: number,
}

function App() {
    const [selectedLevels, setSelectedLevels] = React.useState<string[]>([]); // level names
    const [requirements, setRequirements] = React.useState<ItemRequirement[]>([]);

    React.useEffect(() => {
        console.log('html to react initial renderz: ' + (+new Date() - HTMLTIME));
    }, []);

    return <>
        <header>ARK&#x2468;</header>
        <main>
            <section id="levels">{gamedata.levels.map(level => 
                <div key={level.name} className='level-container'>
                    <Checkbox
                        checked={selectedLevels.includes(level.name)} 
                        onChange={e => setSelectedLevels(e.target.checked ? selectedLevels.concat([level.name]) : selectedLevels.filter(e => e != level.name))} />
                    <span className='level-name'>{level.name}</span>
                    {level.drops.map(drop => 
                        <span key={drop.itemName} className='level-drop'>{drop.itemName}: {drop.probility}</span>)}
                </div>)}
            </section>
            <section id="items">{gamedata.items.map(item => 
                <div key={item.name} className='item-container'>
                    <span className='item-name'>{item.name}</span>
                    <InputNumber 
                        className='item-have' 
                        value={requirements.find(r => r.itemName)?.have ?? 0} 
                        onChange={(newValue: any) => { 
                            if (requirements.some(r => r.itemName == item.name)) {
                                requirements.find(r => r.itemName).have = newValue;
                                setRequirements(requirements);
                            } else {
                                requirements.push({ itemName: item.name, have: newValue, expect: 0 });
                                setRequirements(requirements);
                            }}} />
                    <span className='have-to-expect'>=&gt;</span>
                    <InputNumber className='item-expect' 
                        value={requirements.find(r => r.itemName)?.expect ?? 0}
                        onChange={(newValue: any) => { 
                            if (requirements.some(r => r.itemName == item.name)) {
                                requirements.find(r => r.itemName).expect = newValue;
                                setRequirements(requirements);
                            } else {
                                requirements.push({ itemName: item.name, expect: newValue, have: 0 });
                                setRequirements(requirements);
                            }}} />
                    {item.froms && <span className='synthesis-container'>{item.froms.map(from => 
                        <span key={from.itemName} className='item-name'>{from.itemName}x{from.count}</span>)}
                    </span>}
                </div>)}
            </section>
            <Button>GO</Button>
            <section id='plan-result' style={{ display: 'none' }}>
                RESULTRESULTRESULT
            </section>
        </main>
        <footer>FOOTER PLACEHOLDER</footer>
    </>;
}

ReactDOM.render(<App/>, document.querySelector('div#root'));

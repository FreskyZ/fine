import process from 'process';
import DataContext from './data/context';

async function main(): Promise<void> {

    const context = await DataContext.create();
    const checker = async (id: string, pass: string) => await context.executeSql(
        'SELECT EXISTS(SELECT * FROM `User` WHERE `LoginId` = ? AND `Password` = ?) AS `e`;', id, pass);

    //if (result.fields) {
    //    console.log('fields: ', result.fields.map(f => f.name));
    // }

    const result1 = await checker('fresky', '123456');
    const result2 = await checker('fresky', '12345');

    console.log('result1.results[0].e == 1 =', result1.results[0].e == 1);
    console.log('result2.results[0].e == 0 =', result2.results[0].e == 0);
}

main().then(() => { process.exit(0); }).catch(ex => { console.log(ex); process.exit(1); });


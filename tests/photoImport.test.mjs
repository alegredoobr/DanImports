import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { matchProduct, detailPatch, importEntry, imageIdentity } from '../src/lib/photoImport.mjs';
import { PRODUCTS } from '../scripts/products-data.mjs';
const entries = JSON.parse(readFileSync(new URL('../src/data/photo-import.json', import.meta.url)));
const products = PRODUCTS.map((p, i) => ({ ...p, id: `produto-${i}` }));
test('50 associações seguras, nenhuma duplicidade de destino e todas as fotos disponíveis', () => {
  const ids = entries.filter(r => !r.review).map(r => matchProduct(r, products));
  assert.equal(ids.length, 50); assert.ok(ids.every(Boolean)); assert.equal(new Set(ids).size,50);
  for (const row of entries) for (const file of row.files) assert.ok(existsSync(new URL(`../public${file}`, import.meta.url)));
  assert.equal(matchProduct({ target_name: 'Hawas Tropical' }, products), '');
  assert.equal(matchProduct({target_slug:'original',target_name:'Nome antigo'},[{id:'id1',slug:'original',name:'Nome editado'}]),'id1');
  assert.equal(matchProduct({ target_name: 'Asad' }, [...products, {name:'Asad',id:'duplicado'}]), '');
});
test('preenche somente vazios, preserva preço e admite substituição explícita', () => {
  const current = { description:'Texto existente', top_notes:'', price_cents:35000 };
  assert.deepEqual(detailPatch(current, {description:'Novo',top_notes:'Bergamota',price_cents:1}), {top_notes:'Bergamota'});
  assert.deepEqual(detailPatch(current, {description:'Novo'}, true), {description:'Novo'});
  assert.deepEqual(detailPatch(current, {description:''}, true), {});
});
test('identidade da foto é estável e varia com produto e conteúdo', async () => {
  const a = await imageIdentity('p1', new Uint8Array([1,2]));
  assert.deepEqual(a, await imageIdentity('p1', new Uint8Array([1,2])));
  assert.notEqual(a.id, (await imageIdentity('p2',new Uint8Array([1,2]))).id);
  assert.notEqual(a.path, (await imageIdentity('p1',new Uint8Array([1,3]))).path);
});
function mock() {
  const product = {id:'p1', description:'Texto existente',price_cents:35000};
  const images = [], uploads = []; let failAttach = false;
  const client = {
    from(table) {
      let patch; const filters = {};
      const q = {select(){return q;},eq(k,v){filters[k]=v;return q;},update(p){patch=p;return q;},
        single:async()=>{if(patch)Object.assign(product,patch);return {data:product};},
        then(resolve){resolve({data:images.filter(i=>Object.entries(filters).every(([k,v])=>i[k]===v))});}};
      return q;
    },
    storage:{from(){return {upload:async(path)=>{uploads.push(path);return {data:{path}};}};}},
    rpc:async(_name,args)=>{if(failAttach){failAttach=false;return {error:new Error('interrupção simulada')};} if(!images.some(i=>i.path===args.p_path)) images.push({id:args.p_image_id,path:args.p_path,product_id:args.p_product_id,position:images.length});return {data:null};},
  };
  return {client,product,images,uploads,fail(){failAttach=true;}};
}
const fetchPhoto = async file => ({ok:true,blob:async()=>new Blob([file],{type:'image/jpeg'})});
test('repetir importação mantém uma foto e preserva conteúdo existente', async () => {
  const m=mock(),row={productId:'p1',files:['a.jpg'],description:'Novo',top_notes:'Limão'};
  await importEntry(m.client,'product-images',row,fetchPhoto);
  await importEntry(m.client,'product-images',row,fetchPhoto);
  assert.equal(m.images.length,1);assert.equal(m.uploads.length,1);
  assert.equal(m.product.description,'Texto existente');assert.equal(m.product.top_notes,'Limão');assert.equal(m.product.price_cents,35000);
});
test('falha depois do upload pode ser retomada sem duplicar', async () => {
  const m=mock();m.fail();const row={productId:'p1',files:['a.jpg','b.jpg'],description:'Novo'};
  await assert.rejects(importEntry(m.client,'product-images',row,fetchPhoto),/interrupção/);
  await importEntry(m.client,'product-images',row,fetchPhoto);
  await importEntry(m.client,'product-images',row,fetchPhoto);
  assert.equal(m.images.length,2);assert.equal(new Set(m.uploads).size,2);
  assert.equal(m.product.description,'Texto existente');
});

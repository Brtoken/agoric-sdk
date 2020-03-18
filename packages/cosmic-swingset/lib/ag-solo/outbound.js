import anylogger from 'anylogger';

const log = anylogger('outbound');

const knownTargets = new Map(); // target => { deliverator, highestSent, highestAck }

export function deliver(mbs) {
  const data = mbs.exportToData();
  log.debug(`deliver`, data);
  for (const target of Object.getOwnPropertyNames(data)) {
    if (!knownTargets.has(target)) {
      log.error(`eek, no delivery method for target`, target);
      // eslint-disable-next-line no-continue
      continue;
    }
    const t = knownTargets.get(target);
    const newMessages = [];
    data[target].outbox.forEach(m => {
      const [msgnum, body] = m;
      if (msgnum > t.highestSent) {
        log.debug(`new outbound message ${msgnum} for ${target}: ${body}`);
        newMessages.push(m);
      }
    });
    newMessages.sort((a, b) => a[0] - b[0]);
    // console.log(` ${newMessages.length} new messages`);
    const acknum = data[target].inboundAck;
    if (newMessages.length || acknum !== t.highestAck) {
      log.info(
        `invoking deliverator; ${newMessages.length} new messages for ${target}`,
      );
      t.deliverator(newMessages, acknum);
      if (newMessages.length) {
        [t.highestSent] = newMessages[newMessages.length - 1];
      }
      t.highestAck = acknum;
    }
  }
}

export function addDeliveryTarget(target, deliverator) {
  if (knownTargets.has(target)) {
    throw new Error(`target ${target} already added`);
  }
  knownTargets.set(target, { deliverator, highestSent: 0, highestAck: 0 });
}

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const serviceAccount = {
  projectId: 'lms-portal-ba7b0',
  clientEmail: 'firebase-adminsdk-fbsvc@lms-portal-ba7b0.iam.gserviceaccount.com',
  privateKey: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDFX4WrclyZEbHC\nr0DQaL2ORYqIG1qSa4BK/IyYRDOWXeBpZbzUuWSi/oGdjnHmJmwvM3j3af10+W7j\nROeGYPnN7xtMYAJqRpGkN6xpeonqeZGDd6l9CIazt0lqNujiZcV26+gnu1wOAyna\nWNIg+BTHCgJTUqlq15qGGtdNdKpnMeTqYxma798cIVXfCSC9Uq8rHDfcbnULn3Iv\n5Oio6JS9y8TMz0Bq7GdcD82pOeicu6GHMTIwF6NKwl6EfQ96oohTuu0+xXCgJoeW\nSCHCsnRnZQg7ITT0tf+jdiuRwzzyVIxOeE4Z3d+3oUYwMehaGT/Du4U0Jsf/jlwI\nb0tTomBnAgMBAAECggEAMw2aTdavDQj+qhUa9s2g+oQSaVJqAyW7caoR0/EQRvzR\nZ3HhfkTWOzMJ4+9MlvOpWCxARf8siG1cuXzBRokfFJ2cugy7kzHdylR8TGxd8ECx\n2wfA1461CReH7el2I9mfUjuDOYPFM/qtgMUo1U5WUYXNRDBFklViqv2WY3qh+T8C\nZML1JxDmY6isb1obR1IQblq+hbDS6Cm9z0IwLPHPQgEVfMFRbC2PN44eCfIxmeD7\nGTN+BwcJ6AiCLlqUh3EA+ukZfTWAxbJasMdZ9ONh6XKNG00Er4eqh8P3bvIhfT7E\nENbIoPDI1JIB695PwQTIaJ/n43c02tpaOtn6Y/6/AQKBgQDioWGyG3fuAAhrgyCK\nGYGDtaOL/2LxDjWrCkzqfSdVPncotSDomrntxeqVtPqUZZ3fwXaT/Z/9TNmBwhpX\nKA80gtxWlij2s/n0luyk337b+Q5oW31rB02yx/anlTQ4jHD7nvQ0iuxO9JinJPro\neivKfW8IFRkK5G9itNmgrV9zlwKBgQDe84LDxHs9/3qmlVDuFgY1uLctm9EIoFFn\nkddOhheQoBC4ov6117PvDx4/cYaN5tu39CRXAEEHBISOIMnZg+dn7q220fGt0sGm\nZp7cBeoo+Dzp18FEXJv5/Touh1kB/b7RkUUigKqfTJho88YbTyBrSVB3wTJW/Svx\n4N7rjlLTsQKBgQDT5/AwmIyQJsm4tZhUaLr4S3vL6JU8LnwyHOSEkVeY1lqW3p4R\nwLM/R8MsDlgLL+TplrzobcsODrCGKtd0TUnCYOXjtG5DF1ANyp0lILE+v+cf3wQr\ncl3NYDoawmFcyrzOGffftVJ2FTEzgFl3zNxrbtPF6+xJigU4dz/ShKnuqwKBgQCG\nKUjeH0T+SNd4mM+rhatU9oOcOXBvXXG+/j7u7LgPepK1WLgnmtaXG6TbDqimiW5c\nYtjfVbLL00ck88wjTUGaBEGaivmA3RtU09nyksiWwNJ+8StGxOfDZkN1rlK8ZQJH\nv8A3g++ojoIEXfUvh8z9Yo++kI6HVC/2jJf4bZuf8QKBgBEU2Pq6NzX622D5QuOg\nzoJ4RQv8roF3iYowDHQeSxVC3+rGxkdBHFuWZcq9bx1wFkOejspPk+y/LNRhOg/R\nGoM7tm4lE2S4ebRv3mK/UYox0sJ1qJDWu6zZ7nns359UyUjSBEouGEHcTBrT4GUp\nLbmO88dLij2C+ikUSfIbTxN9\n-----END PRIVATE KEY-----\n'
};
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
Promise.all([
  db.collection('students').get(),
  db.collection('users').where('role', '==', 'student').get()
]).then(([snap1, snap2]) => {
  console.log('students count in /students:', snap1.size);
  console.log('students count in /users:', snap2.size);
  process.exit(0);
});
